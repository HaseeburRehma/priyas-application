"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  PropertiesListResult,
  PropertiesSortField,
  PropertyKind,
  PropertyStatus,
} from "@/lib/api/properties.types";

export type PropertiesQueryParams = {
  q: string;
  kind: PropertyKind | "all";
  status: PropertyStatus | "all";
  page: number;
  pageSize: number;
  sort: PropertiesSortField;
  direction: "asc" | "desc";
};

export function useProperties(params: PropertiesQueryParams) {
  return useQuery<PropertiesListResult>({
    queryKey: ["properties", params],
    queryFn: async () => {
      const url = new URL("/api/properties", window.location.origin);
      url.searchParams.set("q", params.q);
      url.searchParams.set("kind", params.kind);
      url.searchParams.set("status", params.status);
      url.searchParams.set("page", String(params.page));
      url.searchParams.set("pageSize", String(params.pageSize));
      url.searchParams.set("sort", params.sort);
      url.searchParams.set("direction", params.direction);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`properties_fetch_failed_${res.status}`);
      return (await res.json()) as PropertiesListResult;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
