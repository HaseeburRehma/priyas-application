"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useProperties } from "@/hooks/properties/useProperties";
import type {
  PropertyKind,
  PropertyStatus,
} from "@/lib/api/properties.types";
import { PropertiesToolbar } from "./PropertiesToolbar";
import { PropertiesTable } from "./PropertiesTable";

const PAGE_SIZE = 25;

export function PropertiesPageClient() {
  const t = useTranslations("properties.toolbar");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PropertyKind | "all">("all");
  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"name" | "assignments" | "client">("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const { data, isLoading, isFetching } = useProperties({
    q,
    kind,
    status,
    page,
    pageSize: PAGE_SIZE,
    sort,
    direction,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      <PropertiesToolbar
        q={q}
        onQ={(v) => {
          setQ(v);
          setPage(1);
        }}
        kind={kind}
        onKind={(v) => {
          setKind(v);
          setPage(1);
        }}
        status={status}
        onStatus={(v) => {
          setStatus(v);
          setPage(1);
        }}
        view={view}
        onView={setView}
      />

      {view === "list" ? (
        <PropertiesTable
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
          {t("viewGrid")} —{" "}
          <span className="text-neutral-400">soon · switch to list</span>
        </div>
      )}
    </div>
  );
}
