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

  // Unauthenticated → bounce to login (except on public routes).
  if (!user && !isPublic) {
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
