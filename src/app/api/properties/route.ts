import { NextResponse, type NextRequest } from "next/server";
import { loadPropertiesList } from "@/lib/api/properties";
import type { PropertyKind, PropertyStatus } from "@/lib/api/properties.types";

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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const kindRaw = url.searchParams.get("kind") ?? "all";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sort =
    (url.searchParams.get("sort") as "name" | "assignments" | "client") ??
    "name";
  const direction =
    (url.searchParams.get("direction") as "asc" | "desc") ?? "asc";

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
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "load_properties_failed" },
      { status: 500 },
    );
  }
}
