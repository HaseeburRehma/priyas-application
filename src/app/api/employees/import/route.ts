import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requirePermission,
  PermissionError,
} from "@/lib/rbac/permissions";
import {
  readImportRequest,
  runImport,
  writeImportAudit,
  checkImportThrottle,
} from "@/lib/import/runImport";

/**
 * CSV import schema for employees.
 *
 * Columns (header row):
 *   full_name, email, phone, hire_date, weekly_hours, hourly_rate_eur,
 *   status, role, notes
 *
 * The auth invite step that `createEmployeeAction` performs is intentionally
 * skipped here — bulk-inviting users via email is a separate concern. The
 * row is created with profile_id = NULL; the existing handle_new_user()
 * trigger will claim the row when each invitee later signs up.
 *
 * The spec calls this `employee.invite`, but the permission matrix names it
 * `employee.create`. We check the canonical name.
 */
const importEmployeeRow = z.object({
  full_name: z.string().min(2).max(160),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  hire_date: z
    .string()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
      message: "Ungültiges Datum",
    })
    .optional(),
  weekly_hours: z.coerce.number().min(0).max(80).default(40),
  hourly_rate_eur: z.coerce.number().min(0).max(500).optional(),
  status: z
    .enum(["active", "on_leave", "inactive"])
    .default("active"),
  role: z.enum(["admin", "dispatcher", "employee"]).default("employee"),
  notes: z.string().max(2000).optional(),
});
type ImportEmployeeRow = z.infer<typeof importEmployeeRow>;

const COLUMN_MAP: Record<string, keyof ImportEmployeeRow> = {
  full_name: "full_name",
  email: "email",
  phone: "phone",
  hire_date: "hire_date",
  weekly_hours: "weekly_hours",
  hourly_rate_eur: "hourly_rate_eur",
  status: "status",
  role: "role",
  notes: "notes",
};

export async function POST(request: NextRequest) {
  try {
    // Spec wording is "employee.invite"; the matrix exposes this via
    // "employee.create". Same admin-only audience.
    await requirePermission("employee.create");
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof PermissionError ? err.message : "Forbidden",
      },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const throttle = checkImportThrottle(user?.id ?? null);
  if (throttle) {
    return NextResponse.json({ error: throttle }, { status: 429 });
  }

  const parsed = await readImportRequest(request);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) {
    return NextResponse.json(
      { error: "Profile not attached to org" },
      { status: 400 },
    );
  }

  const result = await runImport<ImportEmployeeRow>({
    module: "employees",
    file: parsed.file,
    schema: importEmployeeRow,
    columnMap: COLUMN_MAP,
    dryRun: parsed.dryRun,
    insertOne: async (row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((supabase.from("employees") as any)).insert({
        org_id: orgId,
        full_name: row.full_name,
        email: row.email ?? null,
        phone: row.phone ?? null,
        hire_date: row.hire_date || null,
        weekly_hours: row.weekly_hours,
        hourly_rate_eur:
          typeof row.hourly_rate_eur === "number" ? row.hourly_rate_eur : null,
        status: row.status,
        notes: row.notes ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });

  if (!parsed.dryRun && result.insertedCount > 0) {
    await writeImportAudit({
      module: "employees",
      tableName: "employees",
      result,
    });
  }

  return NextResponse.json(result);
}

export async function GET() {
  const header = Object.keys(COLUMN_MAP).join(",");
  const sample = [
    "Maria Mustermann", // full_name
    "maria@beispiel.de", // email
    "+49 170 1234567", // phone
    "2025-09-01", // hire_date
    "40", // weekly_hours
    "18.50", // hourly_rate_eur
    "active", // status
    "employee", // role
    "Sprachen: DE, EN", // notes
  ];
  const escaped = sample.map(csvEscape);
  const body = `${header}\n${escaped.join(",")}\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="employees-template.csv"',
      "cache-control": "no-store",
    },
  });
}

// SECURITY: defuse Excel / Google Sheets formula injection — see
// src/app/api/employees/route.ts.
function csvEscape(s: string): string {
  let out = s;
  if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (!/[",\n]/.test(out)) return out;
  return `"${out.replace(/"/g, '""')}"`;
}
