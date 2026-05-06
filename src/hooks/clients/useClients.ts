"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  ClientCustomerType,
  ClientsListResult,
} from "@/lib/api/clients.types";

export type ClientsQueryParams = {
  q: string;
  type: ClientCustomerType | "all";
  page: number;
  pageSize: number;
  sort: "name" | "properties" | "contract_start";
  direction: "asc" | "desc";
};

/**
 * Wraps GET /api/clients in TanStack Query. Keeps previous data while
 * paginating so the table doesn't flash empty between page changes.
 */
export function useClients(params: ClientsQueryParams) {
  return useQuery<ClientsListResult>({
    queryKey: ["clients", params],
    queryFn: async () => {
      const url = new URL("/api/clients", window.location.origin);
      url.searchParams.set("q", params.q);
      url.searchParams.set("type", params.type);
      url.searchParams.set("page", String(params.page));
      url.searchParams.set("pageSize", String(params.pageSize));
      url.searchParams.set("sort", params.sort);
      url.searchParams.set("direction", params.direction);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`clients_fetch_failed_${res.status}`);
      return (await res.json()) as ClientsListResult;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
