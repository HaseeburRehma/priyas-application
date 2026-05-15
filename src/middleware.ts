import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every page request except:
     *   - Next.js's own static buckets (_next/static, _next/image)
     *   - favicon
     *   - image assets (svg/png/jpg/jpeg/gif/webp/ico)
     *   - PWA artefacts (sw.js, manifest.webmanifest, icons/*) — these
     *     must be served WITHOUT auth redirects. A redirect on /sw.js
     *     trips the ServiceWorker spec's "no redirect" rule; a redirect
     *     on the manifest returns HTML and breaks the JSON parse.
     *   - Common bot endpoints (robots.txt, sitemap.xml)
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
