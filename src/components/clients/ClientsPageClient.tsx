"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useClients } from "@/hooks/clients/useClients";
import { useTableSelection } from "@/hooks/useTableSelection";
import type { ClientCustomerType, ClientsSortField } from "@/lib/api/clients.types";
import { ClientsToolbar } from "./ClientsToolbar";
import { ClientsTable } from "./ClientsTable";
import { BulkActionBar, type BulkAction } from "@/components/shared/BulkActionBar";
import { bulkArchiveClientsAction } from "@/app/actions/clients";

const PAGE_SIZE = 25;

type Props = {
  canArchive: boolean;
};

/**
 * Owns search/filter/sort/pagination state for the clients table. Listens
 * to the URL is intentionally NOT done here — the spec doesn't ask for it
 * and it doubles the test surface area. We can add `nuqs` later.
 */
export function ClientsPageClient({ canArchive }: Props) {
  const t = useTranslations("clients.table");
  const tBulk = useTranslations("bulk");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<ClientCustomerType | "all">("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ClientsSortField>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  // Feature-update #9: Active (default) vs Old (archived) view toggle.
  const [archived, setArchived] = useState(false);
  const [pending, start] = useTransition();

  const { data, isLoading, isFetching } = useClients({
    q,
    type,
    page,
    pageSize: PAGE_SIZE,
    sort,
    direction,
    archived,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const { selectedIds, isAllSelected, toggleOne, toggleAll, clear } =
    useTableSelection(rows);
  const selectedCount = selectedIds.size;

  function exportSelected() {
    const ids = Array.from(selectedIds).join(",");
    const url = `/api/clients?format=csv&ids=${encodeURIComponent(ids)}`;
    window.open(url, "_blank", "noopener");
  }

  // Feature-update #8: export the current filtered/view'd set, not just
  // the selection. Forwards q/type/sort/direction/archived so the CSV
  // matches what the user sees on screen.
  function exportAll() {
    const url = new URL("/api/clients", window.location.origin);
    url.searchParams.set("format", "csv");
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("type", type);
    url.searchParams.set("sort", sort);
    url.searchParams.set("direction", direction);
    if (archived) url.searchParams.set("archived", "1");
    window.open(url.toString(), "_blank", "noopener");
  }

  function archiveSelected() {
    const count = selectedCount;
    if (count === 0) return;
    if (!confirm(tBulk("bulkArchiveConfirm", { count }))) return;
    start(async () => {
      const ids = Array.from(selectedIds);
      const r = await bulkArchiveClientsAction(ids);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.failed === 0) {
        toast.success(tBulk("actionSuccess", { count: r.data.ok }));
      } else {
        toast.success(
          tBulk("actionPartial", { ok: r.data.ok, failed: r.data.failed }),
        );
      }
      clear();
      router.refresh();
    });
  }

  const actions: BulkAction[] = [];
  actions.push({
    key: "export",
    label: tBulk("bulkExport"),
    onClick: exportSelected,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
      </svg>
    ),
  });
  if (canArchive) {
    actions.push({
      key: "archive",
      label: tBulk("bulkArchive"),
      onClick: archiveSelected,
      tone: "danger",
      disabled: pending,
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        </svg>
      ),
    });
  }

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
        archived={archived}
        onArchived={(v) => {
          setArchived(v);
          setPage(1);
          clear();
        }}
        onExportAll={exportAll}
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
          selectedIds={selectedIds}
          isAllSelected={isAllSelected}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
        />
      ) : (
        <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
          {t("gridSoon")}
        </div>
      )}

      <BulkActionBar count={selectedCount} actions={actions} onClear={clear} />
    </div>
  );
}
