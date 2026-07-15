/**
 * Catalogue of scope strings recognised by the v1 surface. Kept here
 * (rather than co-located with `v1-auth.ts`) so client components can
 * import the list without dragging in `server-only` and the Supabase
 * service-role client.
 *
 * Single source of truth for: the auth helper's scope check, the
 * OpenAPI spec generator, and the API-keys management UI.
 */
export const V1_SCOPES = [
  "read:clients",
  "read:properties",
  "read:employees",
  /**
   * Separate from `read:employees` on purpose — compensation data
   * (hourly_rate_eur) is more sensitive than roster/contact/shift info
   * and most integrations (scheduling, rostering) never need it. A key
   * scoped to `read:employees` alone can list/inspect staff but the v1
   * employee-detail route strips `hourly_rate_eur` unless this scope is
   * also granted.
   */
  "read:employees:compensation",
  "read:shifts",
  "read:invoices",
  // `write:*` scopes were previously listed here and grantable via
  // createApiKeyAction, but every /api/v1 route is GET-only — no route
  // handler ever checks a write:* scope, so a key minted with one implied
  // mutation access that doesn't exist. Removed until write endpoints
  // actually ship; add them back alongside the routes that check them.
] as const;

export type V1Scope = (typeof V1_SCOPES)[number];
