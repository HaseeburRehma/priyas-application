import "server-only";
import type { ZodType, ZodTypeAny } from "zod";
import { parseAndValidateCsv } from "./csv";

export type ImportError = {
  row: number;
  column?: string;
  message: string;
};

export type ImportResult = {
  totalRows: number;
  validCount: number;
  errorCount: number;
  insertedCount: number;
  skippedCount: number;
  errors: ImportError[];
  durationMs: number;
};

export type RunImportArgs<T> = {
  /** Logical module name — used in error messages / audit metadata. */
  module: string;
  /** Uploaded CSV file (from `formData.get("file")`). */
  file: File;
  /** Zod schema each parsed row must satisfy. */
  schema: ZodTypeAny;
  /** Mapping from CSV header → schema field (e.g. { "Name": "full_name" }). */
  columnMap: Record<string, keyof T>;
  /** When true, parse + validate only — do not write anything. */
  dryRun: boolean;
  /** Per-row inserter. Called only for rows that passed validation. */
  insertOne: (row: T) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * Generic CSV import runner.
 *
 * Behaviour notes:
 *   - Partial import: rows that fail Zod validation are skipped; the rest
 *     are still inserted. The summary distinguishes `validCount` (passed
 *     validation) from `insertedCount` (also passed DB insert).
 *   - Concurrency 1 — we insert sequentially so per-row error reporting is
 *     deterministic and so we never overload Supabase's connection pool.
 *   - Errors from insertOne are recorded as row-level errors but do NOT
 *     abort the run — the caller decides how to react.
 */
export async function runImport<T>({
  file,
  schema,
  columnMap,
  dryRun,
  insertOne,
}: RunImportArgs<T>): Promise<ImportResult> {
  const startedAt = Date.now();
  const parsed = await parseAndValidateCsv<T>(
    file,
    schema as unknown as ZodType<T>,
    columnMap,
  );

  const errors: ImportError[] = [];
  for (const row of parsed.rows) {
    for (const err of row.errors) {
      errors.push({
        row: row.rowNumber,
        column: err.column,
        message: err.message,
      });
    }
  }

  if (dryRun) {
    return {
      totalRows: parsed.totalRows,
      validCount: parsed.validCount,
      errorCount: parsed.errorCount,
      insertedCount: 0,
      skippedCount: parsed.errorCount,
      errors,
      durationMs: Date.now() - startedAt,
    };
  }

  let insertedCount = 0;
  let skippedCount = parsed.errorCount;

  // Sequential insert. Each insertOne is awaited so the caller's audit /
  // notification side effects don't race.
  for (const row of parsed.rows) {
    if (row.parsed === null) continue;
    try {
      const res = await insertOne(row.parsed);
      if (res.ok) {
        insertedCount += 1;
      } else {
        skippedCount += 1;
        errors.push({
          row: row.rowNumber,
          message: res.error ?? "Insert failed.",
        });
      }
    } catch (err) {
      skippedCount += 1;
      errors.push({
        row: row.rowNumber,
        message: err instanceof Error ? err.message : "Insert threw.",
      });
    }
  }

  return {
    totalRows: parsed.totalRows,
    validCount: parsed.validCount,
    errorCount: parsed.errorCount,
    insertedCount,
    skippedCount,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

/* ============================================================================
 * Multipart helpers shared by every import route handler.
 * ========================================================================== */

/** Maximum import size — keeps in-memory parse bounded. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Extract the uploaded File + dryRun flag from a NextRequest. Returns an
 * error string when the request is malformed so the route can return 400.
 */
export async function readImportRequest(
  request: Request,
): Promise<{ file: File; dryRun: boolean } | { error: string; status: number }> {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { error: "Invalid multipart body.", status: 400 };
  }
  const fileField = form.get("file");
  if (!(fileField instanceof File)) {
    return { error: "Missing 'file' field.", status: 400 };
  }
  if (fileField.size > MAX_IMPORT_BYTES) {
    return {
      error: `File too large (max ${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} MB).`,
      status: 413,
    };
  }
  return { file: fileField, dryRun };
}

/**
 * Best-effort audit-log write. Mirrors the shape used by server actions
 * (`src/app/actions/*`). Never throws — audit failures must not block
 * the import response.
 */
export async function writeImportAudit(args: {
  module: string;
  tableName: string;
  result: ImportResult;
}): Promise<void> {
  try {
    const { createSupabaseServerClient } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await ((supabase.from("profiles") as any))
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id;
    if (!orgId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("audit_log") as any)).insert({
      org_id: orgId,
      user_id: user.id,
      action: "import",
      table_name: args.tableName,
      record_id: null,
      after: {
        message: `CSV-Import: ${args.result.insertedCount} importiert, ${args.result.skippedCount} übersprungen.`,
        meta: "via WebApp",
        module: args.module,
        inserted_count: args.result.insertedCount,
        skipped_count: args.result.skippedCount,
        total_rows: args.result.totalRows,
        error_count: args.result.errorCount,
        duration_ms: args.result.durationMs,
      },
    });
  } catch {
    // Audit failures are non-fatal.
  }
}

/* ============================================================================
 * Process-local throttle. Stops the same user from queueing 10 imports
 * back-to-back. NOTE: in multi-replica deployments this only covers the
 * local process — TODO swap to the Upstash-backed limiter once we add a
 * named bucket for imports.
 * ========================================================================== */
const lastImportAt = new Map<string, number>();
const IMPORT_MIN_INTERVAL_MS = 5_000;

export function checkImportThrottle(userId: string | null): string | null {
  const key = userId ?? "anon";
  const last = lastImportAt.get(key) ?? 0;
  const now = Date.now();
  if (now - last < IMPORT_MIN_INTERVAL_MS) {
    const sec = Math.ceil((IMPORT_MIN_INTERVAL_MS - (now - last)) / 1000);
    return `Bitte warte ${sec}s vor dem nächsten Import.`;
  }
  lastImportAt.set(key, now);
  return null;
}
