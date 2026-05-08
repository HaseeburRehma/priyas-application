import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      // Supabase Storage public bucket
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    // CSP for Priya's. Each directive below is intentionally explicit so
    // future changes are auditable.
    //
    // - default-src 'self'                  fall-through baseline
    // - script-src + 'unsafe-inline'        Next.js's runtime injects an
    //                                       inline boot script. A nonce-
    //                                       based CSP would be tighter but
    //                                       requires a custom server.
    // - style-src 'unsafe-inline'           Tailwind emits some inline
    //                                       styles via the preflight
    //                                       reset; React also sets style=.
    // - img-src data: blob: https:          allow data URIs (icons,
    //                                       generated SVGs from
    //                                       SignaturePad.tsx) + blob:
    //                                       previews from photo/voice
    //                                       uploads + any HTTPS host so
    //                                       Supabase Storage signed URLs
    //                                       work without an allow-list.
    // - media-src 'self' blob: https:       voice memo previews are blobs;
    //                                       chat-attachments come from
    //                                       Supabase Storage over https.
    // - connect-src                         Supabase REST + Realtime (wss),
    //                                       plus 'self' for our own API.
    // - frame-src youtube + vimeo           training video embeds
    //                                       (TrainingHub.tsx).
    // - worker-src 'self' blob:             public/sw.js for Web Push.
    // - object-src 'none'                   no Flash, no plugins.
    // - frame-ancestors 'none'              equivalent to X-Frame-Options
    //                                       DENY for modern browsers.
    // - base-uri 'self'                     stop attackers retargeting
    //                                       relative URLs.
    // - form-action 'self'                  block forms posting elsewhere.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // upgrade-insecure-requests is harmless on dev (no http content
      // anyway) and required on prod under HSTS.
      "upgrade-insecure-requests",
    ].join("; ");

    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Camera stays off (file picker doesn't need it). Microphone is
      // enabled for the chat composer's voice-memo recorder. Geolocation
      // is enabled for GPS check-in / out.
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=(self)",
      },
      { key: "Content-Security-Policy", value: csp },
    ];

    // HSTS only in production. Setting it on localhost would force the
    // browser to upgrade to HTTPS for the dev server, which most setups
    // can't satisfy.
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

export default withNextIntl(config);
