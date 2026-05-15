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
 * CSV import schema for clients.
 *
 * Columns (header row):
 *   display_name, customer_type, email, phone, contact_name, tax_id, notes,
 *   insurance_provider, insurance_number, care_level
 *
 * `customer_type` accepts: residential | commercial | alltagshilfe.
 * For alltagshilfe rows, the three insurance/care fields are required —
 * those constraints are enforced inside the per-row schema below.
 */
const importClientRow = z
  .object({
    display_name: z.string().min(2).max(200),
    customer_type: z.enum(["residential", "commercial", "alltagshilfe"]),
    email: z.string().email().max(200).optional(),
    phone: z.string().max(40).optional(),
    contact_name: z.string().max(120).optional(),
    tax_id: z.string().max(40).optional(),
    notes: z.string().max(4000).optional(),
    insurance_provider: z.string().max(80).optional(),
    insurance_number: z.string().max(40).optional(),
    care_level: z.coerce.number().int().min(1).max(5).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.customer_type === "alltagshilfe") {
      if (!v.insurance_provider) {
        ctx.addIssue({
          path: ["insurance_provider"],
          code: z.ZodIssueCode.custom,
          message: "Pflichtfeld für Alltagshilfe.",
        });
      }
      if (!v.insurance_number) {
        ctx.addIssue({
          path: ["insurance_number"],
          code: z.ZodIssueCode.custom,
          message: "Pflichtfeld für Alltagshilfe.",
        });
      }
      if (typeof v.care_level !== "number") {
        ctx.addIssue({
          path: ["care_level"],
          code: z.ZodIssueCode.custom,
          message: "Pflegegrad 1–5 erforderlich.",
        });
      }
    }
  });
type ImportClientRow = z.infer<typeof importClientRow>;

const COLUMN_MAP: Record<string, keyof ImportClientRow> = {
  display_name: "display_name",
  customer_type: "customer_type",
  email: "email",
  phone: "phone",
  contact_name: "contact_name",
  tax_id: "tax_id",
  notes: "notes",
  insurance_provider: "insurance_provider",
  insurance_number: "insurance_number",
  care_level: "care_level",
};

export async function POST(request: NextRequest) {
  try {
    await requirePermission("client.create");
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

  const result = await runImport<ImportClientRow>({
    module: "clients",
    file: parsed.file,
    schema: importClientRow,
    columnMap: COLUMN_MAP,
    dryRun: parsed.dryRun,
    insertOne: async (row) => {
      const insertRow: Record<string, unknown> = {
        org_id: orgId,
        customer_type: row.customer_type,
        display_name: row.display_name,
        contact_name: row.contact_name ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        tax_id: row.tax_id ?? null,
        notes: row.notes ?? null,
      };
      if (row.customer_type === "alltagshilfe") {
        insertRow.insurance_provider = row.insurance_provider;
        insertRow.insurance_number = row.insurance_number;
        insertRow.care_level = row.care_level;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((supabase.from("clients") as any))
        .insert(insertRow);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });

  if (!parsed.dryRun && result.insertedCount > 0) {
    await writeImportAudit({
      module: "clients",
      tableName: "clients",
      result,
    });
  }

  return NextResponse.json(result);
}

export async function GET() {
  const header = Object.keys(COLUMN_MAP).join(",");
  const sample = [
    "Mustermann GmbH", // display_name
    "commercial", // customer_type
    "kontakt@mustermann.de", // email
    "+49 30 1234567", // phone
    "Maria Mustermann", // contact_name
    "DE123456789", // tax_id
    "Premium-Kunde seit 2023", // notes
    "", // insurance_provider (alltagshilfe only)
    "", // insurance_number
    "", // care_level
  ];
  const escaped = sample.map(csvEscape);
  const body = `${header}\n${escaped.join(",")}\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="clients-template.csv"',
      "cache-control": "no-store",
    },
  });
}

// SECURITY: defuse Excel / Google Sheets formula injection in addition to
// the standard RFC 4180 quoting. See src/app/api/clients/route.ts for the
// rationale.
function csvEscape(s: string): string {
  let out = s;
  if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (!/[",\n]/.test(out)) return out;
  return `"${out.replace(/"/g, '""')}"`;
}
