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
  "read:shifts",
  "read:invoices",
  "write:clients",
  "write:properties",
  "write:employees",
  "write:shifts",
  "write:invoices",
] as const;

export type V1Scope = (typeof V1_SCOPES)[number];
