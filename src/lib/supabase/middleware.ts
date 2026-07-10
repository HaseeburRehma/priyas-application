
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/constants/env";
import { publicRoutes, routes } from "@/lib/constants/routes";

/**
 * Same algorithm as `fingerprintOf()` in `src/app/actions/devices.ts`
 * (sha256(userId|ua|lang), hex, first 40 chars) — reimplemented with Web
 * Crypto because middleware runs on the Edge runtime, where `node:crypto`
 * isn't available. Both must keep producing byte-identical output for the
 * same input for the revoked-device check below to ever match a row.
 */
async function fingerprintOfEdge(
  userId: string,
  ua: string,
  lang: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${userId}|${ua}|${lang}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 40);
}

/**
 * Refreshes the auth session on every request and gates access to private
 * routes. Wired up in src/middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the auth token if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    publicRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico";

  // Every `/api/*` route already enforces its own auth (requirePermission()/
  // can() for cookie-session routes, v1Guard()'s Bearer-token check for the
  // public v1 API, a CRON_SECRET comparison for /api/jobs/*) and returns a
  // proper JSON 401/403 on failure. Redirecting these to the HTML /login
  // page instead — the previous behavior here — broke every non-browser
  // caller: a cron trigger or a v1 API client sends no session cookie by
  // design, so it always hit this redirect before its own auth header was
  // ever checked. `/api/auth/*` (Supabase's own callback endpoints) is
  // covered by isPublic above already; this exemption is for every other
  // `/api/*` route, which are JSON endpoints, not pages, so a redirect is
  // the wrong response shape regardless of auth outcome.
  const isApiRoute = pathname.startsWith("/api/");

  // Refuse requests from a device the user revoked in Settings → Sessions &
  // Devices. This is the enforcement the `user_devices` migration's comment
  // requires ("Application code MUST refuse requests from a revoked device
  // until the user signs in again") — without it, "Revoke" only updates a
  // DB flag while the stolen/lost device's session cookie keeps working
  // indefinitely. Runs in middleware (not just the dashboard layout) so it
  // also covers Server Action POSTs, not just page navigations.
  if (user && !isApiRoute) {
    const ua = request.headers.get("user-agent") ?? "";
    const lang = request.headers.get("accept-language")?.split(",")[0] ?? "";
    const fp = await fingerprintOfEdge(user.id, ua, lang);
    const { data: deviceRow } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("user_devices" as any)
      .select("revoked_at")
      .eq("user_id", user.id)
      .eq("fingerprint", fp)
      .maybeSingle();
    if ((deviceRow as { revoked_at: string | null } | null)?.revoked_at) {
      // signOut() clears the session cookies via the `setAll` callback
      // above, which reassigns the closure's `response`. We must carry
      // those cleared cookies onto the redirect response we return below —
      // a brand-new NextResponse.redirect() wouldn't include them, leaving
      // the (now server-invalidated, but still browser-held) session
      // cookie in place.
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = routes.login;
      url.searchParams.set("reason", "device_revoked");
      const redirect = NextResponse.redirect(url);
      for (const cookie of response.cookies.getAll()) {
        redirect.cookies.set(cookie);
      }
      return redirect;
    }
  }

  // Unauthenticated → bounce to login (except on public routes and any API
  // route, which handles its own auth and must return JSON, not a redirect).
  if (!user && !isPublic && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = routes.login;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated → never show the login or register page; send to dashboard.
  if (
    user &&
    (pathname === routes.login ||
      pathname === routes.register ||
      pathname === "/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = routes.dashboard;
    return NextResponse.redirect(url);
  }

  return response;
}
