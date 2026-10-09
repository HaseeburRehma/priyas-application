/**
 * Clients loaders for the mobile Clients tab.
 *
 * Admin + dispatcher only (RLS enforces this — the client tab is also
 * hidden from field staff at the navigation layer, but this stays
 * as the source of truth).
 *
 * Kept intentionally minimal — the web app has the full CRUD wizard;
 * mobile is a read-first surface with drill-down to detail.
 */

import { getSupabase } from "@/lib/supabase";

export type ClientCustomerType = "residential" | "commercial" | "alltagshilfe";
export type ClientPayerType =
  | "care_fund"
  | "private_pay"
  | "insurance"
  | "commercial";

/** Derived like the web list: latest contract status, archived → ended. */
export type ClientStatus = "active" | "review" | "onboarding" | "ended";

export type ClientRow = {
  id: string;
  display_name: string;
  customer_type: ClientCustomerType;
  payer_type: ClientPayerType | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  property_count: number;
  /** Optional extras (added for the redesigned list; may be absent). */
  created_at?: string | null;
  care_level?: number | null;
  status?: ClientStatus;
  /** Created within the last 30 days. */
  is_new?: boolean;
};

export type ClientDetail = {
  id: string;
  display_name: string;
  customer_type: ClientCustomerType;
  payer_type: ClientPayerType | null;
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  care_level: number | null;
  notes: string | null;
  archived: boolean;
  properties: Array<{ id: string; name: string; city: string | null }>;
};

/**
 * List clients scoped to the caller's org via RLS. Supports a search
 * term (matches name / email / phone) and a type filter.
 */
export async function loadMobileClients(args: {
  q?: string;
  type?: ClientCustomerType | "all";
  limit?: number;
}): Promise<ClientRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("clients")
    .select(
      `id, display_name, customer_type, payer_type, city, phone, email,
       created_at, care_level`,
    )
    .eq("archived", false)
    .is("deleted_at", null)
    .order("display_name", { ascending: true })
    .limit(args.limit ?? 200);

  if (args.q && args.q.trim()) {
    // Strip PostgREST grammar chars + LIKE wildcards. Same defence the
    // web loader applies — keeps the caller from breaking out of .or().
    const safe = args.q.trim().replace(/[,()\\%_]/g, "");
    if (safe) {
      query = query.or(
        `display_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  if (args.type && args.type !== "all") {
    query = query.eq("customer_type", args.type);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    display_name: string;
    customer_type: ClientCustomerType;
    payer_type: ClientPayerType | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    created_at: string | null;
    care_level: number | null;
  };
  const rows = (data ?? []) as Row[];

  // Property counts + latest contract status — one round-trip each,
  // grouped in JS. Empty list short-circuits.
  const ids = rows.map((r) => r.id);
  const countByClient = new Map<string, number>();
  const statusByClient = new Map<string, ClientStatus>();
  if (ids.length > 0) {
    const [{ data: props }, { data: contracts }] = await Promise.all([
      supabase
        .from("properties")
        .select("client_id")
        .is("deleted_at", null)
        .in("client_id", ids),
      supabase
        .from("contracts")
        .select("client_id, status, start_date")
        .is("deleted_at", null)
        .in("client_id", ids)
        .order("start_date", { ascending: false }),
    ]);
    for (const p of (props ?? []) as Array<{ client_id: string }>) {
      countByClient.set(p.client_id, (countByClient.get(p.client_id) ?? 0) + 1);
    }
    for (const c of (contracts ?? []) as Array<{ client_id: string; status: string }>) {
      if (statusByClient.has(c.client_id)) continue;
      statusByClient.set(c.client_id, contractStatusOf(c.status));
    }
  }

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  return rows.map((r) => ({
    id: r.id,
    display_name: r.display_name,
    customer_type: r.customer_type,
    payer_type: r.payer_type,
    city: r.city,
    phone: r.phone,
    email: r.email,
    property_count: countByClient.get(r.id) ?? 0,
    created_at: r.created_at,
    care_level: r.care_level,
    status: statusByClient.get(r.id) ?? "review",
    is_new: !!r.created_at && new Date(r.created_at).getTime() >= thirtyDaysAgo,
  }));
}

/** contracts.status → list status (same mapping as the web list). */
function contractStatusOf(status: string | null | undefined): ClientStatus {
  return status === "active" ? "active" : status === "draft" ? "onboarding" : "ended";
}

/**
 * Per-type counts for the filter chips. Applies the same search term as
 * the list (but not the type filter) so the chips show where matches are.
 */
export async function loadClientTypeCounts(args: {
  q?: string;
}): Promise<Record<ClientCustomerType | "all", number>> {
  const supabase = getSupabase();
  let query = supabase
    .from("clients")
    .select("customer_type")
    .eq("archived", false)
    .is("deleted_at", null)
    .limit(5000);
  if (args.q && args.q.trim()) {
    const safe = args.q.trim().replace(/[,()\\%_]/g, "");
    if (safe) {
      query = query.or(
        `display_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  const out = { all: 0, residential: 0, commercial: 0, alltagshilfe: 0 };
  for (const r of (data ?? []) as Array<{ customer_type: ClientCustomerType }>) {
    out.all += 1;
    if (r.customer_type in out) out[r.customer_type] += 1;
  }
  return out;
}

export type ClientsSummary = {
  total: number;
  activeContracts: number;
  newLast30Days: number;
  endingSoon: number;
};

/** Stat strip on the Clients tab — same counts as the web summary. */
export async function loadMobileClientsSummary(): Promise<ClientsSummary> {
  const supabase = getSupabase();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyDaysAhead = new Date(now.getTime() + 60 * 86_400_000);
  const [total, fresh, ending, active] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .is("deleted_at", null),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null)
      .gte("end_date", now.toISOString().slice(0, 10))
      .lte("end_date", sixtyDaysAhead.toISOString().slice(0, 10)),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
  ]);
  if (total.error) throw total.error;
  return {
    total: total.count ?? 0,
    activeContracts: active.count ?? 0,
    newLast30Days: fresh.count ?? 0,
    endingSoon: ending.count ?? 0,
  };
}

export async function loadMobileClientDetail(
  id: string,
): Promise<ClientDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select(
      `id, display_name, customer_type, payer_type, first_name, last_name,
       address_line1, postal_code, city, email, phone,
       insurance_provider, insurance_number, care_level, notes, archived`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const c = data as ClientDetail;

  const { data: props } = await supabase
    .from("properties")
    .select("id, name, city")
    .eq("client_id", id)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return {
    ...c,
    properties: ((props ?? []) as Array<{
      id: string;
      name: string;
      city: string | null;
    }>).map((p) => ({ id: p.id, name: p.name, city: p.city })),
  };
}

/* ============================================================================
 * Client overview — everything the redesigned detail screen shows beyond
 * the base record: hero stats, contacts, latest contract, service scopes,
 * invoices, billing settings and the internal hours card. Kept separate
 * from `loadMobileClientDetail` so a missing optional column / table can
 * never take the base screen down with it.
 * ========================================================================== */

export type ClientContact = {
  id: string;
  full_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

export type ClientContract = {
  start_date: string;
  end_date: string | null;
  notice_period_days: number | null;
  legal_form: string | null;
  status: "draft" | "active" | "terminated" | string;
};

export type ClientScope = {
  id: string;
  service_type: string;
  frequency: string | null;
  special_notes: string | null;
};

export type ClientInvoice = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_cents: number;
  issue_date: string | null;
};

export type ClientBilling = {
  mode: "hourly" | "fixed";
  hourly_rate_cents: number | null;
  fixed_monthly_fee_cents: number | null;
  contracted_hours_per_month: number | null;
  contract_months: number | null;
  contract_start: string | null;
  contract_end: string | null;
};

export type ClientHoursMonth = {
  /** "2026-10" */
  month: string;
  plannedMinutes: number;
  actualMinutes: number;
  shiftCount: number;
};

export type ClientOverview = {
  created_at: string | null;
  company_name: string | null;
  customer_number: string | null;
  tax_id: string | null;
  vat_id: string | null;
  contact_name: string | null;
  notes_updated_at: string | null;
  notes_updated_by_name: string | null;
  billing: ClientBilling | null;
  contacts: ClientContact[];
  contract: ClientContract | null;
  scopes: ClientScope[];
  invoices: ClientInvoice[];
  ytd_invoiced_cents: number;
  shift_count: number;
  /** Newest month first; empty when not requested (Alltagshilfe). */
  hours: ClientHoursMonth[];
};

const HOURS_MONTHS_BACK = 3;

const monthKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Internal hours per month for the client's properties (newest first).
 * Mirrors the web `loadClientHours`: planned = scheduled duration of every
 * non-cancelled shift; actual = completed shifts, billable → actual →
 * scheduled minutes. Months are bucketed in device-local time.
 */
async function loadClientHoursFor(propertyIds: string[]): Promise<ClientHoursMonth[]> {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 0; i < HOURS_MONTHS_BACK; i++) {
    keys.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 15)));
  }
  const byMonth = new Map<string, ClientHoursMonth>(
    keys.map((k) => [k, { month: k, plannedMinutes: 0, actualMinutes: 0, shiftCount: 0 }]),
  );
  if (propertyIds.length > 0) {
    const from = new Date(now.getFullYear(), now.getMonth() - (HOURS_MONTHS_BACK - 1), 1);
    const { data, error } = await getSupabase()
      .from("shifts")
      .select("starts_at, ends_at, status, billable_minutes, actual_minutes")
      .is("deleted_at", null)
      .in("property_id", propertyIds)
      .neq("status", "cancelled")
      .gte("starts_at", from.toISOString())
      .limit(5000);
    if (error) throw error;
    type Row = {
      starts_at: string;
      ends_at: string;
      status: string;
      billable_minutes: number | null;
      actual_minutes: number | null;
    };
    for (const r of (data ?? []) as Row[]) {
      const bucket = byMonth.get(monthKeyOf(new Date(r.starts_at)));
      if (!bucket) continue;
      const scheduled = Math.max(
        0,
        Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000),
      );
      bucket.plannedMinutes += scheduled;
      bucket.shiftCount += 1;
      if (r.status === "completed") {
        bucket.actualMinutes += r.billable_minutes ?? r.actual_minutes ?? scheduled;
      }
    }
  }
  return keys.map((k) => byMonth.get(k)!);
}

export async function loadMobileClientOverview(
  id: string,
  opts: { propertyIds: string[]; withHours: boolean },
): Promise<ClientOverview> {
  const supabase = getSupabase();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

  const [extraRes, contactsRes, contractRes, scopesRes, invoicesRes, shiftCountRes, hours] =
    await Promise.all([
      supabase
        .from("clients")
        .select(
          `created_at, company_name, customer_number, tax_id, vat_id, contact_name,
           notes_updated_at, notes_updated_by,
           billing_mode, default_hourly_rate_cents, agreed_hourly_rate_cents,
           fixed_monthly_fee_cents, contracted_hours_per_month, contract_months,
           contract_start, contract_end`,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("client_contacts")
        .select("id, full_name, role, email, phone, is_primary")
        .eq("client_id", id)
        .order("is_primary", { ascending: false })
        .order("full_name", { ascending: true }),
      supabase
        .from("contracts")
        .select("start_date, end_date, notice_period_days, legal_form, status")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("service_scopes")
        .select("id, service_type, frequency, special_notes")
        .eq("client_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, total_cents, issue_date")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .limit(200),
      opts.propertyIds.length > 0
        ? supabase
            .from("shifts")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .in("property_id", opts.propertyIds)
        : Promise.resolve({ count: 0 }),
      opts.withHours
        ? loadClientHoursFor(opts.propertyIds).catch(() => [] as ClientHoursMonth[])
        : Promise.resolve([] as ClientHoursMonth[]),
    ]);

  type Extra = {
    created_at: string | null;
    company_name: string | null;
    customer_number: string | null;
    tax_id: string | null;
    vat_id: string | null;
    contact_name: string | null;
    notes_updated_at: string | null;
    notes_updated_by: string | null;
    billing_mode: string | null;
    default_hourly_rate_cents: number | null;
    agreed_hourly_rate_cents: number | null;
    fixed_monthly_fee_cents: number | null;
    contracted_hours_per_month: number | string | null;
    contract_months: number | null;
    contract_start: string | null;
    contract_end: string | null;
  };
  const x = (extraRes.error ? null : extraRes.data) as Extra | null;

  let notesBy: string | null = null;
  if (x?.notes_updated_by) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", x.notes_updated_by)
      .maybeSingle();
    notesBy = (prof as { full_name: string | null } | null)?.full_name ?? null;
  }

  const invoices = ((invoicesRes.data ?? []) as ClientInvoice[]).map((r) => ({
    ...r,
    total_cents: Number(r.total_cents ?? 0),
  }));
  const ytd = invoices.reduce(
    (sum, r) =>
      r.issue_date && r.issue_date >= yearStart &&
      (r.status === "paid" || r.status === "sent" || r.status === "overdue")
        ? sum + r.total_cents
        : sum,
    0,
  );

  return {
    created_at: x?.created_at ?? null,
    company_name: x?.company_name ?? null,
    customer_number: x?.customer_number ?? null,
    tax_id: x?.tax_id ?? null,
    vat_id: x?.vat_id ?? null,
    contact_name: x?.contact_name ?? null,
    notes_updated_at: x?.notes_updated_at ?? null,
    notes_updated_by_name: notesBy,
    billing: x
      ? {
          mode: x.billing_mode === "fixed" ? "fixed" : "hourly",
          hourly_rate_cents:
            x.default_hourly_rate_cents ?? x.agreed_hourly_rate_cents ?? null,
          fixed_monthly_fee_cents: x.fixed_monthly_fee_cents ?? null,
          contracted_hours_per_month:
            x.contracted_hours_per_month == null
              ? null
              : Number(x.contracted_hours_per_month),
          contract_months: x.contract_months ?? null,
          contract_start: x.contract_start ?? null,
          contract_end: x.contract_end ?? null,
        }
      : null,
    contacts: ((contactsRes.data ?? []) as ClientContact[]).map((c) => ({
      ...c,
      is_primary: !!c.is_primary,
    })),
    contract: (contractRes.error ? null : (contractRes.data as ClientContract | null)) ?? null,
    scopes: (scopesRes.data ?? []) as ClientScope[],
    invoices,
    ytd_invoiced_cents: ytd,
    shift_count: shiftCountRes.count ?? 0,
    hours,
  };
}
