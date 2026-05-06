"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  EmployeesListResult,
  EmployeeRoleChip,
  EmployeeStatus,
} from "@/lib/api/employees.types";

export type EmployeesQueryParams = {
  q: string;
  role: EmployeeRoleChip | "all";
  status: EmployeeStatus | "all";
  page: number;
  pageSize: number;
  sort: "name" | "hours" | "status";
  direction: "asc" | "desc";
};

export function useEmployees(params: EmployeesQueryParams) {
  return useQuery<EmployeesListResult>({
    queryKey: ["employees", params],
    queryFn: async () => {
      const url = new URL("/api/employees", window.location.origin);
      url.searchParams.set("q", params.q);
      url.searchParams.set("role", params.role);
      url.searchParams.set("status", params.status);
      url.searchParams.set("page", String(params.page));
      url.searchParams.set("pageSize", String(params.pageSize));
      url.searchParams.set("sort", params.sort);
      url.searchParams.set("direction", params.direction);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`employees_fetch_failed_${res.status}`);
      return (await res.json()) as EmployeesListResult;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
