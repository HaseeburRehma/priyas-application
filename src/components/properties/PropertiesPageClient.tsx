"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useProperties } from "@/hooks/properties/useProperties";
import { useTableSelection } from "@/hooks/useTableSelection";
import type {
  PropertiesSortField,
  PropertyKind,
  PropertyStatus,
} from "@/lib/api/properties.types";
import { PropertiesToolbar } from "./PropertiesToolbar";
import { PropertiesTable } from "./PropertiesTable";
import { BulkActionBar, type BulkAction } from "@/components/shared/BulkActionBar";
import {
  bulkArchivePropertiesAction,
  bulkAssignPropertiesAction,
} from "@/app/actions/properties";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 25;

type Props = {
  canDelete: boolean;
  canUpdate: boolean;
};

export function PropertiesPageClient({ canDelete, canUpdate }: Props) {
  const t = useTranslations("properties.toolbar");
  const tBulk = useTranslations("bulk");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PropertyKind | "all">("all");
  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<PropertiesSortField>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [assignOpen, setAssignOpen] = useState(false);
  const [pending, start] = useTransition();

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

  const { selectedIds, isAllSelected, toggleOne, toggleAll, clear } =
    useTableSelection(rows);
  const selectedCount = selectedIds.size;

  function exportSelected() {
    const ids = Array.from(selectedIds).join(",");
    const url = `/api/properties?format=csv&ids=${encodeURIComponent(ids)}`;
    window.open(url, "_blank", "noopener");
  }

  function archiveSelected() {
    const count = selectedCount;
    if (count === 0) return;
    if (!confirm(tBulk("bulkArchiveConfirm", { count }))) return;
    start(async () => {
      const ids = Array.from(selectedIds);
      const r = await bulkArchivePropertiesAction(ids);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.failed === 0) {
        toast.success(tBulk("actionSuccess", { count: r.data.ok }));
      } else {
        toast.success(
          tBulk("actionPartial", {
            ok: r.data.ok,
            failed: r.data.failed,
          }),
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
  if (canUpdate) {
    actions.push({
      key: "assign",
      label: tBulk("bulkAssign"),
      onClick: () => setAssignOpen(true),
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
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
          <circle cx={9} cy={7} r={4} />
          <path d="M19 8v6M22 11h-6" />
        </svg>
      ),
    });
  }
  if (canDelete) {
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
          selectedIds={selectedIds}
          isAllSelected={isAllSelected}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
        />
      ) : (
        <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
          {t("viewGrid")} —{" "}
          <span className="text-neutral-400">soon · switch to list</span>
        </div>
      )}

      <BulkActionBar
        count={selectedCount}
        actions={actions}
        onClear={clear}
      />

      {assignOpen && (
        <BulkAssignDialog
          onClose={() => setAssignOpen(false)}
          onSaved={(clientId) => {
            const ids = Array.from(selectedIds);
            start(async () => {
              const r = await bulkAssignPropertiesAction(ids, clientId);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              if (r.data.failed === 0) {
                toast.success(tBulk("actionSuccess", { count: r.data.ok }));
              } else {
                toast.success(
                  tBulk("actionPartial", {
                    ok: r.data.ok,
                    failed: r.data.failed,
                  }),
                );
              }
              setAssignOpen(false);
              clear();
              router.refresh();
            });
          }}
          pending={pending}
        />
      )}
    </div>
  );
}

/**
 * Modal asking the user to pick the target client. Fetches a flat list
 * of clients from `/api/clients?pageSize=500` on mount.
 */
function BulkAssignDialog({
  onClose,
  onSaved,
  pending,
}: {
  onClose: () => void;
  onSaved: (clientId: string) => void;
  pending: boolean;
}) {
  const tBulk = useTranslations("bulk");
  const tForm = useTranslations("properties.form");
  const [clients, setClients] = useState<
    Array<{ id: string; display_name: string }>
  >([]);
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);

  // Load the client universe (the bulk-assign target picker). 500 is
  // generous; the spec caps client lists well below that. The same
  // endpoint backs the table so RLS already scopes the result.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = new URL("/api/clients", window.location.origin);
        url.searchParams.set("page", "1");
        url.searchParams.set("pageSize", "500");
        url.searchParams.set("sort", "name");
        url.searchParams.set("direction", "asc");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as {
            rows: Array<{ id: string; display_name: string }>;
          };
          if (cancelled) return;
          setClients(json.rows);
          if (json.rows[0]) setClientId(json.rows[0].id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <div>
            <h2 className="text-[18px] font-bold text-secondary-500">
              {tBulk("bulkAssignTitle")}
            </h2>
          </div>
          <button
            type="button"
            aria-label="close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50"
          >
            <span aria-hidden>✕</span>
          </button>
        </header>

        <div className="p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
              {tForm("client")}
            </span>
            <select
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={loading}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost border border-neutral-200"
          >
            {tForm("back")}
          </button>
          <button
            type="button"
            disabled={pending || !clientId}
            onClick={() => onSaved(clientId)}
            className={cn(
              "btn btn--primary",
              (pending || !clientId) && "opacity-80",
            )}
          >
            {tForm("save")}
          </button>
        </footer>
      </div>
    </div>
  );
}
