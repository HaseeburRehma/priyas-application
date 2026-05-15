/**
 * Client-safe shapes for the clients module. Lives in its own file so the
 * server-only `clients.ts` (which imports `next/headers`) doesn't get
 * dragged into client component bundles.
 */

export type ClientCustomerType = "residential" | "commercial" | "alltagshilfe";
export type ClientStatus = "active" | "review" | "onboarding" | "ended";

export type ClientRow = {
  id: string;
  display_name: string;
  customer_type: ClientCustomerType;
  email: string | null;
  phone: string | null;
  property_count: number;
  status: ClientStatus;
  contract_start: string | null;
  is_new: boolean;
};

export type ClientsSummary = {
  total: number;
  activeContracts: number;
  newLast30Days: number;
  endingSoon: number;
  newThisMonth: number;
};

/**
 * Sortable columns wired through to the DB query. `properties` is a
 * client-side aggregate (count from the `properties` table) so we can't
 * push it down as an `.order()` clause yet — the table only exposes the
 * DB-backed columns.
 */
export type ClientsSortField = "name" | "contract_start";

export type ClientsListParams = {
  q?: string;
  type?: ClientCustomerType | "all";
  page?: number;
  pageSize?: number;
  sort?: ClientsSortField;
  direction?: "asc" | "desc";
  /**
   * When `false` (default), archived clients are hidden from the list.
   * Set to `true` to include archived rows (e.g. on an "Archive" tab).
   */
  archived?: boolean;
  /**
   * Restrict the result set to these IDs. Used for bulk-export CSVs
   * that should only contain the user's current selection.
   */
  ids?: ReadonlyArray<string>;
};

export type ClientsListResult = {
  rows: ClientRow[];
  total: number;
};

export type ClientDetail = {
  id: string;
  display_name: string;
  customer_type: ClientCustomerType;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  care_level: number | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  // Aggregates
  property_count: number;
  contact_count: number;
  assignment_count: number;
  ytd_invoiced_cents: number;
  // Latest contract
  contract: {
    id: string;
    start_date: string;
    end_date: string | null;
    notice_period_days: number;
    legal_form: string | null;
    status: "draft" | "active" | "terminated";
  } | null;
};
