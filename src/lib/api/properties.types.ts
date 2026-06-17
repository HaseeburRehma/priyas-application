/** Property kinds shown as colored chips in the table. */
export type PropertyKind =
  | "office"
  | "retail"
  | "residential"
  | "medical"
  | "industrial"
  | "other";

export type PropertyStatus = "active" | "onboarding" | "attention" | "paused";

export type PropertyRow = {
  id: string;
  name: string;
  address: string;
  kind: PropertyKind;
  client_id: string;
  client_name: string;
  /** `"alltagshilfe"` when the owning client is a care client — drives red row tinting. */
  client_customer_type: string | null;
  assignments_per_week: number;
  status: PropertyStatus;
  team_lead_id: string | null;
  team_lead_name: string | null;
  team_lead_initials: string | null;
  is_new: boolean;
};

export type PropertiesSummary = {
  total: number;
  activelyServiced: number;
  newlyOnboarded30d: number;
  needsAttention: number;
  newThisQuarter: number;
};

/**
 * Sortable columns wired through to the DB query. `assignments` is computed
 * client-side (last 7 days of shifts) so we can't push it down as an
 * `.order()` clause yet — the table only exposes the DB-backed columns.
 */
export type PropertiesSortField = "name" | "client";

export type PropertiesListParams = {
  q?: string;
  kind?: PropertyKind | "all";
  status?: PropertyStatus | "all";
  page?: number;
  pageSize?: number;
  sort?: PropertiesSortField;
  direction?: "asc" | "desc";
  /**
   * Restrict the result set to these IDs. Used for bulk-export CSVs
   * that should only contain the user's current selection. When set,
   * other filters still apply but the universe is constrained to
   * these rows.
   */
  ids?: ReadonlyArray<string>;
};

export type PropertiesListResult = {
  rows: PropertyRow[];
  total: number;
};

export type PropertyArea = {
  id: string;
  name: string;
  floor: string | null;
  zone: string | null;
  size_sqm: number | null;
  frequency: string | null;
};

export type PropertyDetail = {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  country: string;
  size_sqm: number | null;
  notes: string | null;
  // Structured location detail
  floor: string | null;
  building_section: string | null;
  access_code: string | null;
  // Structured safety + access notes
  allergies: string | null;
  restricted_areas: string | null;
  safety_regulations: string | null;
  // Cleaning concept document (PDF in property-documents bucket)
  cleaning_concept_path: string | null;
  latitude: number | null;
  longitude: number | null;
  client_id: string;
  client_name: string;
  client_type: string;
  kind: PropertyKind;
  // `status` is derived (no DB column yet). Computed from
  // `deleted_at`, the created_at age and recent shift activity in
  // `loadPropertyDetail`. We never fabricate "active" — when there is
  // no signal we leave it null and let the UI render "—".
  status: PropertyStatus | null;
  rooms: number | null;
  weekly_frequency: number;
  team_size: number;
  contract_end: string | null;
  created_at: string;
  // Aggregates. `document_count` and `area_count` are null when the
  // underlying table doesn't exist (no `property_documents` /
  // `property_areas` in the schema today) so the UI can render "—"
  // instead of fabricated counts.
  assignment_count: number;
  document_count: number | null;
  area_count: number | null;
  // Lists
  team: { id: string; name: string; initials: string; role: string }[];
  // `areas` is null when no `property_areas` table exists in this
  // deployment. UI must guard against this.
  areas: PropertyArea[] | null;
  /** Last 5 shifts at this property, newest first. Drives the
   *  "Recent assignments" card on the detail page. */
  recent_assignments: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    employee_initials: string;
    employee_name: string | null;
  }>;
  /** Incident count in the trailing 12 months, sourced from
   *  `damage_reports` when the table exists; 0 otherwise. */
  incidents_12mo: number;
};
