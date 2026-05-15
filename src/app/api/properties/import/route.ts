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
 * CSV import schema for properties.
 *
 * Columns (header row, in this order):
 *   name, address_line1, postal_code, city, country, client_email,
 *   address_line2, size_sqm, floor, building_section, access_code,
 *   allergies, restricted_areas, safety_regulations, notes
 *
 * `client_email` is the link to an existing client (resolved per row to
 * client_id). All other fields mirror createPropertySchema in
 * src/lib/validators/properties.ts.
 */
const importPropertyRow = z.object({
  name: z.string().min(2).max(200),
  address_line1: z.string().min(2).max(200),
  postal_code: z.string().min(3).max(20),
  city: z.string().min(2).max(100),
  country: z.string().min(2).max(2).default("DE"),
  client_email: z.string().email("Ungültige Kunden-E-Mail").max(200),
  address_line2: z.string().max(200).optional(),
  size_sqm: z.coerce.number().nonnegative().max(1_000_000).optional(),
  floor: z.string().max(60).optional(),
  building_section: z.string().max(120).optional(),
  access_code: z.string().max(60).optional(),
  allergies: z.string().max(2000).optional(),
  restricted_areas: z.string().max(2000).optional(),
  safety_regulations: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
type ImportPropertyRow = z.infer<typeof importPropertyRow>;

const COLUMN_MAP: Record<string, keyof ImportPropertyRow> = {
  name: "name",
  address_line1: "address_line1",
  address_line2: "address_line2",
  postal_code: "postal_code",
  city: "city",
  country: "country",
  client_email: "client_email",
  size_sqm: "size_sqm",
  floor: "floor",
  building_section: "building_section",
  access_code: "access_code",
  allergies: "allergies",
  restricted_areas: "restricted_areas",
  safety_regulations: "safety_regulations",
  notes: "notes",
};

export async function POST(request: NextRequest) {
  // 1) Permission.
  try {
    await requirePermission("property.create");
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof PermissionError ? err.message : "Forbidden",
      },
      { status: 403 },
    );
  }

  // 2) Throttle.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const throttle = checkImportThrottle(user?.id ?? null);
  if (throttle) {
    return NextResponse.json({ error: throttle }, { status: 429 });
  }

  // 3) Read multipart body.
  const parsed = await readImportRequest(request);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }

  // 4) Resolve org_id (used for inserts + client lookups).
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

  // 5) Run the import.
  const result = await runImport<ImportPropertyRow>({
    module: "properties",
    file: parsed.file,
    schema: importPropertyRow,
    columnMap: COLUMN_MAP,
    dryRun: parsed.dryRun,
    insertOne: async (row) => {
      // Resolve the client by email scoped to this org.
      const { data: clientRow, error: clientErr } = await ((
        supabase.from("clients") as unknown as {
          select: (cols: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{
                  data: { id: string } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        }
      ))
        .select("id")
        .eq("org_id", orgId)
        .eq("email", row.client_email)
        .maybeSingle();
      if (clientErr) return { ok: false, error: clientErr.message };
      const clientId = (clientRow as { id: string } | null)?.id;
      if (!clientId) {
        return {
          ok: false,
          error: `Kunde mit E-Mail '${row.client_email}' nicht gefunden.`,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((supabase.from("properties") as any)).insert({
        org_id: orgId,
        client_id: clientId,
        name: row.name,
        address_line1: row.address_line1,
        address_line2: row.address_line2 ?? null,
        postal_code: row.postal_code,
        city: row.city,
        country: row.country ?? "DE",
        size_sqm: typeof row.size_sqm === "number" ? row.size_sqm : null,
        floor: row.floor ?? null,
        building_section: row.building_section ?? null,
        access_code: row.access_code ?? null,
        allergies: row.allergies ?? null,
        restricted_areas: row.restricted_areas ?? null,
        safety_regulations: row.safety_regulations ?? null,
        notes: row.notes ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });

  if (!parsed.dryRun && result.insertedCount > 0) {
    await writeImportAudit({
      module: "properties",
      tableName: "properties",
      result,
    });
  }

  return NextResponse.json(result);
}

/* ============================================================================
 * GET — return a CSV template (header row + one instructive sample row).
 * ========================================================================== */
export async function GET() {
  const header = Object.keys(COLUMN_MAP).join(",");
  const sample = [
    "Buero Mustermann", // name
    "Beispielstraße 12", // address_line1
    "10115", // postal_code
    "Berlin", // city
    "DE", // country
    "kunde@beispiel.de", // client_email (must match an existing client.email)
    "Aufgang B", // address_line2
    "120", // size_sqm
    "2. OG", // floor
    "Bauteil West", // building_section
    "1234#", // access_code
    "keine bekannt", // allergies
    "Serverraum nur Mo-Fr", // restricted_areas
    "Helm bei Industriebereich", // safety_regulations
    "Schluessel beim Hausmeister", // notes
  ];
  // Properly CSV-escape the sample so commas-in-values don't break the file.
  const escaped = sample.map(csvEscape);
  const body = `${header}\n${escaped.join(",")}\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="properties-template.csv"',
      "cache-control": "no-store",
    },
  });
}

// SECURITY: defuse Excel / Google Sheets formula injection — see
// src/app/api/properties/route.ts.
function csvEscape(s: string): string {
  let out = s;
  if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (!/[",\n]/.test(out)) return out;
  return `"${out.replace(/"/g, '""')}"`;
}
