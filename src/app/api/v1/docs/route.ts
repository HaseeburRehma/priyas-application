import { NextResponse } from "next/server";

/**
 * Swagger-UI page that consumes `/api/v1/openapi.json`.
 *
 * Served as a route handler returning static HTML so we don't pull
 * swagger-ui-react (≈3 MB of JS) into the bundle. The UI fetches its
 * own assets from a CDN — locked to a pinned version to avoid drift.
 *
 * Public on purpose: the OpenAPI spec doesn't expose secrets, and a
 * public docs page is the standard expectation for a developer-facing
 * v1 API. The endpoints themselves still require Bearer auth.
 */
export const dynamic = "force-dynamic";

const SWAGGER_VERSION = "5.17.14";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Priya's API v1 · Docs</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css"
      crossorigin="anonymous"
      referrerpolicy="no-referrer"
    />
    <style>
      html, body { margin: 0; padding: 0; background: #fafafa; }
      .topbar { display: none !important; }
      .swagger-ui .info { margin: 20px 0; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js"
      crossorigin="anonymous"
      referrerpolicy="no-referrer"
    ></script>
    <script>
      window.addEventListener('load', function () {
        window.ui = SwaggerUIBundle({
          url: '/api/v1/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
          docExpansion: 'list',
          defaultModelsExpandDepth: 1,
          tryItOutEnabled: true,
          persistAuthorization: true,
        });
      });
    </script>
  </body>
</html>`;

export async function GET() {
  return new NextResponse(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Public docs — cacheable for an hour by intermediaries.
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
