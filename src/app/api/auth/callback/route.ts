import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";

/**
 * OAuth callback handler. Supabase redirects here after Google/Apple sign-in.
 * Exchanges the code for a session and forwards the user to ?next=… .
 *
 * Implementation note: we copy the request URL via `new URL(url)` rather
 * than `url.clone()` — `clone()` is a NextRequest.nextUrl extension, not
 * a standard URL method, and using it on a plain URL throws at runtime.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? routes.dashboard;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const failure = new URL(url);
      failure.pathname = routes.login;
      failure.search = "";
      failure.searchParams.set("error", "oauth");
      return NextResponse.redirect(failure);
    }
  }

  const dest = new URL(url);
  dest.pathname = next;
  dest.search = "";
  return NextResponse.redirect(dest);
}
