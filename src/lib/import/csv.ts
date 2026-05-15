import type { ZodType } from "zod";

/**
 * Result of `parseAndValidateCsv`. Always returns one entry per data row,
 * regardless of whether validation passed — the caller decides what to do
 * with rows where `parsed === null`.
 */
export type ParsedCsv<T> = {
  header: string[];
  rows: Array<{
    rowNumber: number; // 1-based, matches what Excel shows users
    raw: Record<string, string>;
    parsed: T | null; // null when row failed schema validation
    errors: Array<{ column: string; message: string }>;
  }>;
  totalRows: number;
  validCount: number;
  errorCount: number;
};

/** Strip a UTF-8 BOM (﻿) if present. German Excel always emits one. */
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Detect whether the CSV is using `;` or `,` as separator by sampling the
 * first non-empty line. German Excel exports with `;`, US Excel with `,`.
 */
function detectDelimiter(sample: string): "," | ";" {
  const firstLine = sample.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  // Count occurrences outside quoted regions (cheap heuristic for header row).
  let commas = 0;
  let semis = 0;
  let inQuote = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const ch = firstLine[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === ",") commas += 1;
    else if (!inQuote && ch === ";") semis += 1;
  }
  // Tie goes to comma — the more common Anglo default.
  return semis > commas ? ";" : ",";
}

/**
 * Coerce input (File / Buffer / string) into a UTF-8 string. Files are read
 * via `.text()` (browser & undici both support this).
 */
async function toText(input: File | Buffer | string): Promise<string> {
  if (typeof input === "string") return input;
  if (input instanceof Uint8Array) {
    return new TextDecoder("utf-8").decode(input);
  }
  // File / Blob — has .text() on modern runtimes.
  if (typeof (input as File).text === "function") {
    return await (input as File).text();
  }
  throw new Error("Unsupported CSV input type.");
}

/**
 * Minimal RFC-4180 CSV parser. Handles:
 *   - quoted fields with embedded delimiter, CR, LF
 *   - escaped quotes ("")
 *   - CRLF / LF / CR row terminators
 *   - trailing newline tolerated
 *
 * No dependency on papaparse — keeps the bundle slim and avoids the registry
 * dance for what is, ultimately, a 60-line task.
 */
function parseCsv(text: string, delimiter: "," | ";"): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") {
      // Normalize CRLF and CR to LF — push field, push row.
      row.push(field);
      field = "";
      out.push(row);
      row = [];
      if (text[i + 1] === "\n") i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      out.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  // Flush trailing field/row if file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }

  // Drop fully-empty trailing rows (Excel "save as CSV" often emits one).
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (!last) break;
    if (last.length === 0) {
      out.pop();
      continue;
    }
    if (last.length === 1 && (last[0] ?? "").trim() === "") {
      out.pop();
      continue;
    }
    break;
  }

  return out;
}

/**
 * Parse a CSV into typed rows and validate each against a Zod schema.
 *
 * - Tolerant of UTF-8 BOM (German Excel).
 * - Supports `,` and `;` separators (auto-detected per file).
 * - Quoted fields with embedded commas / newlines are handled by the inline
 *   RFC-4180 parser above.
 * - Empty strings are treated as `undefined` so Zod `.optional()` works.
 * - Per-row errors are collected; we never bail on the first failure so the
 *   UI can show every problem at once.
 */
export async function parseAndValidateCsv<T>(
  file: File | Buffer | string,
  schema: ZodType<T>,
  columnMap: Record<string, keyof T>,
): Promise<ParsedCsv<T>> {
  const text = stripBom(await toText(file));
  const delimiter = detectDelimiter(text);

  const grid = parseCsv(text, delimiter);
  if (grid.length === 0) {
    return {
      header: [],
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
    };
  }

  const header = (grid[0] ?? []).map((h) => h.trim());
  const dataRows = grid
    .slice(1)
    // Drop rows that are entirely empty (a blank line in the middle).
    .filter((r) => r.some((cell) => cell.trim().length > 0));

  const rows: ParsedCsv<T>["rows"] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const cells = dataRows[i] ?? [];
    // Header line counts as line 1 → first data row is line 2 in Excel.
    const rowNumber = i + 2;

    // Build a raw record keyed by header name. Trim values; missing trailing
    // columns become "" (Excel doesn't pad short rows).
    const cleanedRaw: Record<string, string> = {};
    for (let c = 0; c < header.length; c += 1) {
      const key = header[c];
      if (!key) continue;
      const value = cells[c] ?? "";
      cleanedRaw[key] = typeof value === "string" ? value.trim() : String(value);
    }

    // Map CSV columns → schema fields, dropping empty strings so .optional()
    // schemas treat them as `undefined` rather than failing min-length checks.
    const candidate: Record<string, unknown> = {};
    for (const [csvCol, schemaField] of Object.entries(columnMap)) {
      const value = cleanedRaw[csvCol];
      if (value === undefined || value === "") continue;
      candidate[schemaField as string] = value;
    }

    const result = schema.safeParse(candidate);
    if (result.success) {
      rows.push({
        rowNumber,
        raw: cleanedRaw,
        parsed: result.data,
        errors: [],
      });
      validCount += 1;
    } else {
      const errors = result.error.issues.map((iss) => ({
        column: iss.path[0] ? String(iss.path[0]) : "_row",
        message: iss.message,
      }));
      rows.push({
        rowNumber,
        raw: cleanedRaw,
        parsed: null,
        errors,
      });
      errorCount += 1;
    }
  }

  return {
    header,
    rows,
    totalRows: dataRows.length,
    validCount,
    errorCount,
  };
}
