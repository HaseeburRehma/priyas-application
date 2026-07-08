import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/constants/env";
import { publicRoutes, routes } from "@/lib/constants/routes";

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
