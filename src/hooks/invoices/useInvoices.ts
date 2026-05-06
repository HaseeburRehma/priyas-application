"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  InvoicesListResult,
  InvoiceStatus,
} from "@/lib/api/invoices.types";

export type InvoicesQueryParams = {
  q: string;
  status: InvoiceStatus | "all";
  page: number;
  pageSize: number;
  sort: "issue_date" | "total" | "client";
  direction: "asc" | "desc";
};

export function useInvoices(params: InvoicesQueryParams) {
  return useQuery<InvoicesListResult>({
    queryKey: ["invoices", params],
    queryFn: async () => {
      const url = new URL("/api/invoices", window.location.origin);
      url.searchParams.set("q", params.q);
      url.searchParams.set("status", params.status);
      url.searchParams.set("page", String(params.page));
      url.searchParams.set("pageSize", String(params.pageSize));
      url.searchParams.set("sort", params.sort);
      url.searchParams.set("direction", params.direction);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`invoices_fetch_failed_${res.status}`);
      return (await res.json()) as InvoicesListResult;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
