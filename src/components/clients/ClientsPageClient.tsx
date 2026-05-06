"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClients } from "@/hooks/clients/useClients";
import type { ClientCustomerType } from "@/lib/api/clients.types";
import { ClientsToolbar } from "./ClientsToolbar";
import { ClientsTable } from "./ClientsTable";

const PAGE_SIZE = 25;

/**
 * Owns search/filter/sort/pagination state for the clients table. Listens
 * to the URL is intentionally NOT done here — the spec doesn't ask for it
 * and it doubles the test surface area. We can add `nuqs` later.
 */
export function ClientsPageClient() {
  const t = useTranslations("clients.table");
  const [q, setQ] = useState("");
  const [type, setType] = useState<ClientCustomerType | "all">("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"name" | "properties" | "contract_start">(
    "name",
  );
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const { data, isLoading, isFetching } = useClients({
    q,
    type,
    page,
    pageSize: PAGE_SIZE,
    sort,
    direction,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      <ClientsToolbar
        q={q}
        onQ={(v) => {
          setQ(v);
          setPage(1);
        }}
        type={type}
        onType={(v) => {
          setType(v);
          setPage(1);
        }}
        view={view}
        onView={setView}
      />

      {view === "list" ? (
        <ClientsTable
          rows={rows}
          loading={isLoading || isFetching}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          sort={sort}
          direction={direction}
          onSortChange={(s, d) => {
            setSort(s);
            setDirection(d);
          }}
          onPageChange={setPage}
        />
      ) : (
        <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
          {t("gridSoon")}
        </div>
      )}
    </div>
  );
}
