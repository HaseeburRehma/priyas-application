import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/constants/env";

/**
 * Server-side Supabase client for use in Server Components, Route Handlers
 * and Server Actions. Reads the user's session from the request cookies.
 *
 * Note: in pure Server Components Next refuses cookie writes, which is why
 * the setters defensively swallow the resulting exception. Mutations should
 * be triggered from a Server Action or Route Handler instead.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // Ignored when called from a Server Component — see note above.
          }
        },
      },
    },
  );
}
