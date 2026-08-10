/**
 * Employees loaders for the mobile Employees screen.
 *
 * Admin + dispatcher only — RLS enforces this on both endpoints; the
 * screen is also hidden from field staff at the More hub. Kept
 * read-first: mobile is for looking up someone in the field, editing
 * lives on the web wizard.
 */

import { getSupabase } from "@/lib/supabase";

export type EmployeeStatus = "active" | "on_leave" | "inactive";
export type EmployeeRole =
  | "admin"
  | "dispatcher"
  | "employee"
  | "auditor"
  | "customer_contact";

export type EmployeeRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: EmployeeRole | null;
  status: EmployeeStatus;
  service_line: "priya" | "alltagshilfe" | null;
  employment_type: string | null;
};

export type EmployeeDetail = EmployeeRow & {
  hourly_cost_cents: number | null;
  weekly_hours_target: number | null;
  contract_start: string | null;
  skills: string[];
  notes: string | null;
};

export async function loadMobileEmployees(args: {
  q?: string;
  serviceLine?: "priya" | "alltagshilfe" | "all";
}): Promise<EmployeeRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("employees")
    .select(
      `id, full_name, email, phone, role, status, service_line, employment_type`,
    )
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(300);

  if (args.q && args.q.trim()) {
    const safe = args.q.trim().replace(/[,()\\%_]/g, "");
    if (safe) {
      query = query.or(
        `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  if (args.serviceLine && args.serviceLine !== "all") {
    query = query.eq("service_line", args.serviceLine);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EmployeeRow[];
}

export async function loadMobileEmployeeDetail(
  id: string,
): Promise<EmployeeDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select(
      `id, full_name, email, phone, role, status, service_line,
       employment_type, hourly_cost_cents, weekly_hours_target,
       contract_start, notes`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;

  // Skills live on a separate join table in the web schema; keep the
  // mobile detail resilient to it being missing (older orgs may not
  // have any rows) by not throwing on error.
  const { data: skillRows } = await supabase
    .from("employee_skills")
    .select("skill")
    .eq("employee_id", id);

  return {
    ...(data as EmployeeRow & {
      hourly_cost_cents: number | null;
      weekly_hours_target: number | null;
      contract_start: string | null;
      notes: string | null;
    }),
    skills: ((skillRows ?? []) as Array<{ skill: string }>).map(
      (r) => r.skill,
    ),
  };
}
