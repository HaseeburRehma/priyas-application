import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeQ } from "@/lib/utils/postgrest-sanitize";
import type {
  ClientCustomerType,
  ClientRow,
  ClientStatus,
  ClientsSummary,
  ClientsListParams,
  ClientsListResult,
  ClientDetail,
} from "./clients.types";

// Re-export so existing imports continue to work.
export type {
  ClientCustomerType,
  ClientRow,
  ClientStatus,
  ClientsSummary,
  ClientsListParams,
  ClientsListResult,
  ClientDetail,
} from "./clients.types";

/* ============================================================================
 * Loaders — server-only (RSC + Route Handlers)
 * ========================================================================== */

/** Aggregated KPIs for the page header strip. */
export async function loadClientsSummary(): Promise<ClientsSummary> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysFromNow = new Date(now);
  sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

  const [totalRes, newLast30Res, newThisMonthRes, endingSoonRes, activeContractsRes] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", thirtyDaysAgo.toISOString()),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", monthStart.toISOString()),
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("deleted_at", null)
        .lte("end_date", sixtyDaysFromNow.toISOString())
        .gte("end_date", now.toISOString()),
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("deleted_at", null),
    ]);

  return {
    total: totalRes.count ?? 0,
    activeContracts: activeContractsRes.count ?? 0,
    newLast30Days: newLast30Res.count ?? 0,
    endingSoon: endingSoonRes.count ?? 0,
    newThisMonth: newThisMonthRes.count ?? 0,
  };
}

/* ============================================================================
 * List filtering — usable from both server and (later) client via the API
 * ========================================================================== */

/**
 * Loads a page of clients with search + filter + sort.
 * Property counts are fetched in a single follow-up grouped query rather
 * than relying on a Postgres view; for 1k–10k clients this is fine. If the
 * dataset grows we'll materialise a `clients_with_counts` view.
 */
export async function loadClientsList(
  params: ClientsListParams = {},
): Promise<ClientsListResult> {
  const supabase = await createSupabaseServerClient();
  const {
    q = "",
    type = "all",
    page = 1,
    pageSize = 25,
    sort = "name",
    direction = "asc",
    archived = false,
    ids,
  } = params;

  let query = supabase
    .from("clients")
    .select(
      "id, display_name, customer_type, email, phone, created_at, archived",
      { count: "exact" },
    )
    .is("deleted_at", null);

  // Bug 2 — Archived clients leak into list view. Hide archived rows by
  // default; callers can opt in via the `archived` flag.
  if (!archived) {
    query = query.eq("archived", false);
  }

  // Bug 3 — Filters MUST be applied before pagination/range and the
  // `count: "exact"` so the total reflects the filtered scope and the
  // returned page matches the user's filtered view.
  if (q) {
    // Use ilike with the trigram fallback (the gin index in the migration).
    // sanitizeQ strips PostgREST grammar chars (`,()\`) and LIKE wildcards
    // (`%_`) so the user-supplied string can't break out of the .or()
    // clause and inject extra filters (e.g. `,deleted_at.is.not.null`).
    const safe = sanitizeQ(q);
    if (safe) {
      query = query.or(
        `display_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  if (type && type !== "all") {
    query = query.eq("customer_type", type);
  }
  // `ids` constrains the universe — used by bulk-export to scope the
  // CSV to the user's current selection.
  if (ids && ids.length > 0) {
    query = query.in("id", [...ids]);
  }

  const sortCol =
    sort === "name"
      ? "display_name"
      : sort === "contract_start"
        ? "created_at"
        : "display_name";
  query = query.order(sortCol, { ascending: direction === "asc" });

  // Pagination — applied AFTER all filters above so the page is sliced
  // out of the filtered set, not the full table.
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  type DbRow = {
    id: string;
    display_name: string;
    customer_type: ClientCustomerType;
    email: string | null;
    phone: string | null;
    created_at: string;
    archived: boolean;
  };
  const dbRows = (data ?? []) as DbRow[];

  // Property counts per client. Empty list → no follow-up.
  const rowIds = dbRows.map((r) => r.id);
  const propsByClient = new Map<string, number>();
  if (rowIds.length > 0) {
    const { data: propsRows } = await supabase
      .from("properties")
      .select("client_id")
      .is("deleted_at", null)
      .in("client_id", rowIds);
    for (const row of (propsRows ?? []) as Array<{ client_id: string }>) {
      propsByClient.set(
        row.client_id,
        (propsByClient.get(row.client_id) ?? 0) + 1,
      );
    }
  }

  // Latest contract status per client (for the "Aktiv / Onboarding / Review"
  // pill). One round-trip; PostgREST will give us all matching rows.
  const contractByClient = new Map<string, ClientStatus>();
  const contractStartByClient = new Map<string, string>();
  if (rowIds.length > 0) {
    const { data: contracts } = await supabase
      .from("contracts")
      .select("client_id, status, start_date")
      .is("deleted_at", null)
      .in("client_id", rowIds)
      .order("start_date", { ascending: false });
    for (const c of (contracts ?? []) as Array<{
      client_id: string;
      status: string;
      start_date: string;
    }>) {
      if (!contractByClient.has(c.client_id)) {
        const s: ClientStatus =
          c.status === "active"
            ? "active"
            : c.status === "draft"
              ? "onboarding"
              : "ended";
        contractByClient.set(c.client_id, s);
        contractStartByClient.set(c.client_id, c.start_date);
      }
    }
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows: ClientRow[] = dbRows.map((r) => ({
    id: r.id,
    display_name: r.display_name,
    customer_type: r.customer_type,
    email: r.email,
    phone: r.phone,
    property_count: propsByClient.get(r.id) ?? 0,
    status: r.archived
      ? "ended"
      : (contractByClient.get(r.id) ?? "review"),
    contract_start: contractStartByClient.get(r.id) ?? null,
    is_new: new Date(r.created_at).getTime() >= thirtyDaysAgo.getTime(),
  }));

  return { rows, total: count ?? 0 };
}

/* ============================================================================
 * Detail loader — drives /clients/[id]
 * ========================================================================== */
export async function loadClientDetail(id: string): Promise<ClientDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: clientRaw, error } = await supabase
    .from("clients")
    .select(
      `id, display_name, customer_type, contact_name, email, phone, tax_id,
       insurance_provider, insurance_number, care_level, notes, archived,
       created_at, updated_at`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !clientRaw) return null;
  const client = clientRaw as Record<string, unknown>;

  // Aggregates: properties, assignments (shifts), invoices YTD.
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const [propsRes, shiftsRes, invoicesRes, contractRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("client_id", id),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in(
        "property_id",
        (
          await supabase.from("properties").select("id").eq("client_id", id).is("deleted_at", null)
        ).data?.map((r: { id: string }) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
      ),
    supabase
      .from("invoices")
      .select("total_cents, status, issue_date")
      .eq("client_id", id)
      .is("deleted_at", null)
      .gte("issue_date", yearStart),
    supabase
      .from("contracts")
      .select("id, start_date, end_date, notice_period_days, legal_form, status")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const invoiceRows = (invoicesRes.data ?? []) as Array<{
    total_cents: number | null;
    status: string;
  }>;
  const ytdInvoiced = invoiceRows.reduce(
    (sum, r) =>
      r.status === "paid" || r.status === "sent" || r.status === "overdue"
        ? sum + Number(r.total_cents ?? 0)
        : sum,
    0,
  );

  return {
    id: String(client.id),
    display_name: String(client.display_name),
    customer_type: client.customer_type as ClientCustomerType,
    contact_name: (client.contact_name as string | null) ?? null,
    email: (client.email as string | null) ?? null,
    phone: (client.phone as string | null) ?? null,
    tax_id: (client.tax_id as string | null) ?? null,
    insurance_provider: (client.insurance_provider as string | null) ?? null,
    insurance_number: (client.insurance_number as string | null) ?? null,
    care_level: (client.care_level as number | null) ?? null,
    notes: (client.notes as string | null) ?? null,
    archived: Boolean(client.archived),
    created_at: String(client.created_at),
    updated_at: String(client.updated_at),
    property_count: propsRes.count ?? 0,
    contact_count: 1, // single contact_name today; future: contacts table
    assignment_count: shiftsRes.count ?? 0,
    ytd_invoiced_cents: ytdInvoiced,
    contract: contractRes.data
      ? {
          id: String((contractRes.data as { id: string }).id),
          start_date: String((contractRes.data as { start_date: string }).start_date),
          end_date:
            ((contractRes.data as { end_date: string | null }).end_date as string | null) ?? null,
          notice_period_days: Number(
            (contractRes.data as { notice_period_days: number }).notice_period_days,
          ),
          legal_form: (contractRes.data as { legal_form: string | null }).legal_form,
          status: (contractRes.data as { status: "draft" | "active" | "terminated" }).status,
        }
      : null,
  };
}
