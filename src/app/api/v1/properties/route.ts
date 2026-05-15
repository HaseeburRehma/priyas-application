import { NextResponse } from "next/server";
import { loadPropertiesList } from "@/lib/api/properties";
import type {
  PropertiesSortField,
  PropertyKind,
  PropertyStatus,
} from "@/lib/api/properties.types";
import { v1Guard, v1ListResponse, v1ErrorResponse } from "@/lib/api/v1-respond";

export const dynamic = "force-dynamic";

const VALID_SORTS: ReadonlyArray<PropertiesSortField> = ["name", "client"];
const VALID_KINDS: ReadonlyArray<PropertyKind | "all"> = [
  "all",
  "office",
  "retail",
  "residential",
  "medical",
  "industrial",
  "other",
];
const VALID_STATUSES: ReadonlyArray<PropertyStatus | "all"> = [
  "all",
  "active",
  "onboarding",
  "attention",
  "paused",
];

export async function GET(request: Request) {
  const guard = await v1Guard(request, "read:properties");
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const kindRaw = url.searchParams.get("kind") ?? "all";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "25") || 25),
  );
  const sortRaw = url.searchParams.get("sort") ?? "name";
  const sort: PropertiesSortField = VALID_SORTS.includes(
    sortRaw as PropertiesSortField,
  )
    ? (sortRaw as PropertiesSortField)
    : "name";
  const direction =
    (url.searchParams.get("direction") as "asc" | "desc") === "desc"
      ? "desc"
      : "asc";
  const kind = VALID_KINDS.includes(kindRaw as PropertyKind | "all")
    ? (kindRaw as PropertyKind | "all")
    : "all";
  const status = VALID_STATUSES.includes(statusRaw as PropertyStatus | "all")
    ? (statusRaw as PropertyStatus | "all")
    : "all";

  try {
    const result = await loadPropertiesList({
      q,
      kind,
      status,
      page,
      pageSize,
      sort,
      direction,
    });
    return v1ListResponse(result.rows, { page, pageSize, total: result.total });
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_properties_failed",
    );
  }
}
