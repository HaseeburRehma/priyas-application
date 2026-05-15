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
 * CSV import schema for training_modules.
 *
 * Columns (header row):
 *   title, description, video_url, is_mandatory, position, locale
 *
 * Booleans accept "true"/"false"/"1"/"0"/"yes"/"no" (case-insensitive).
 */
const trueValues = new Set(["true", "1", "yes", "ja", "y"]);
const falseValues = new Set(["false", "0", "no", "nein", "n", ""]);

const importTrainingRow = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  video_url: z.string().url().max(2000).optional(),
  is_mandatory: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      const lower = v.toLowerCase();
      if (trueValues.has(lower)) return true;
      if (falseValues.has(lower)) return false;
      return false;
    }),
  position: z.coerce.number().int().min(0).max(999).default(0),
  locale: z.enum(["de", "en", "ta"]).default("de"),
});
type ImportTrainingRow = z.infer<typeof importTrainingRow>;

const COLUMN_MAP: Record<string, keyof ImportTrainingRow> = {
  title: "title",
  description: "description",
  video_url: "video_url",
  is_mandatory: "is_mandatory",
  position: "position",
  locale: "locale",
};

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const ctx = await requirePermission("training.manage");
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

  const result = await runImport<ImportTrainingRow>({
    module: "training_modules",
    file: parsed.file,
    schema: importTrainingRow,
    columnMap: COLUMN_MAP,
    dryRun: parsed.dryRun,
    insertOne: async (row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((supabase.from("training_modules") as any))
        .insert({
          org_id: orgId,
          title: row.title,
          description: row.description ?? null,
          video_url: row.video_url ?? null,
          is_mandatory: row.is_mandatory,
          position: row.position,
          locale: row.locale,
          created_by: userId,
        });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });

  if (!parsed.dryRun && result.insertedCount > 0) {
    await writeImportAudit({
      module: "training_modules",
      tableName: "training_modules",
      result,
    });
  }

  return NextResponse.json(result);
}

export async function GET() {
  const header = Object.keys(COLUMN_MAP).join(",");
  const sample = [
    "Sicherheitsunterweisung Allgemein", // title
    "Grundlegende Sicherheitshinweise für alle Mitarbeitenden.", // description
    "https://example.com/video/safety-de.mp4", // video_url
    "true", // is_mandatory
    "10", // position
    "de", // locale
  ];
  const escaped = sample.map((v) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v,
  );
  const body = `${header}\n${escaped.join(",")}\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="training-modules-template.csv"',
      "cache-control": "no-store",
    },
  });
}
