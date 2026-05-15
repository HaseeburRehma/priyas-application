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
 * CSV import schema for shifts (the /schedule module).
 *
 * Columns (header row):
 *   property_name, employee_email, starts_at, ends_at, notes
 *
 * `property_name` and `employee_email` are resolved per-row to the
 * corresponding IDs within the caller's org. starts_at / ends_at must be
 * ISO-8601 datetimes (e.g. "2026-05-12T08:00:00Z" or "2026-05-12T08:00").
 *
 * The bulk importer intentionally does NOT run the conflict-detection net
 * that `createShiftAction` uses (vacation overlap, property closure,
 * mandatory-training lock). Power-user only — surfacing per-row conflicts
 * would balloon scope. The DB still enforces FK + RLS.
 */
const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Ungültiges Datum",
});

const importShiftRow = z
  .object({
    property_name: z.string().min(1).max(200),
    employee_email: z.string().email().max(200).optional(),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "Ende muss nach dem Start liegen.",
    path: ["ends_at"],
  });
type ImportShiftRow = z.infer<typeof importShiftRow>;

const COLUMN_MAP: Record<string, keyof ImportShiftRow> = {
  property_name: "property_name",
  employee_email: "employee_email",
  starts_at: "starts_at",
  ends_at: "ends_at",
  notes: "notes",
};

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const ctx = await requirePermission("shift.create");
    userId = ctx.userId;
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof PermissionError ? err.message : "Forbidden",
      },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const throttle = checkImportThrottle(userId);
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
    .eq("id", userId)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) {
    return NextResponse.json(
      { error: "Profile not attached to org" },
      { status: 400 },
    );
  }

  const result = await runImport<ImportShiftRow>({
    module: "shifts",
    file: parsed.file,
    schema: importShiftRow,
    columnMap: COLUMN_MAP,
    dryRun: parsed.dryRun,
    insertOne: async (row) => {
      // Resolve property by name (scoped to org). Names aren't guaranteed
      // unique but in practice within an org they are. Pick the first match.
      type LookupChain = {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              is: (c: string, v: null) => {
                maybeSingle: () => Promise<{
                  data: { id: string } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
      const { data: propertyRow, error: propErr } = await (
        supabase.from("properties") as unknown as LookupChain
      )
        .select("id")
        .eq("org_id", orgId)
        .eq("name", row.property_name)
        .is("deleted_at", null)
        .maybeSingle();
      if (propErr) return { ok: false, error: propErr.message };
      const propertyId = (propertyRow as { id: string } | null)?.id;
      if (!propertyId) {
        return {
          ok: false,
          error: `Objekt '${row.property_name}' nicht gefunden.`,
        };
      }

      let employeeId: string | null = null;
      if (row.employee_email) {
        const { data: empRow, error: empErr } = await (
          supabase.from("employees") as unknown as LookupChain
        )
          .select("id")
          .eq("org_id", orgId)
          .eq("email", row.employee_email)
          .is("deleted_at", null)
          .maybeSingle();
        if (empErr) return { ok: false, error: empErr.message };
        employeeId = (empRow as { id: string } | null)?.id ?? null;
        if (!employeeId) {
          return {
            ok: false,
            error: `Mitarbeiter '${row.employee_email}' nicht gefunden.`,
          };
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((supabase.from("shifts") as any)).insert({
        org_id: orgId,
        property_id: propertyId,
        employee_id: employeeId,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        notes: row.notes ?? null,
        status: "scheduled",
        created_by: userId,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });

  if (!parsed.dryRun && result.insertedCount > 0) {
    await writeImportAudit({
      module: "shifts",
      tableName: "shifts",
      result,
    });
  }

  return NextResponse.json(result);
}

export async function GET() {
  const header = Object.keys(COLUMN_MAP).join(",");
  const sample = [
    "Buero Mustermann", // property_name (must match existing property.name)
    "maria@beispiel.de", // employee_email (optional; blank = unassigned)
    "2026-05-12T08:00:00Z", // starts_at — ISO-8601
    "2026-05-12T12:00:00Z", // ends_at
    "Wöchentliche Grundreinigung", // notes
  ];
  const escaped = sample.map(csvEscape);
  const body = `${header}\n${escaped.join(",")}\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="shifts-template.csv"',
      "cache-control": "no-store",
    },
  });
}

// SECURITY: defuse Excel / Google Sheets formula injection — see
// src/app/api/clients/route.ts.
function csvEscape(s: string): string {
  let out = s;
  if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (!/[",\n]/.test(out)) return out;
  return `"${out.replace(/"/g, '""')}"`;
}
