"use client";

import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type {
  PropertiesSortField,
  PropertyKind,
  PropertyRow,
  PropertyStatus,
} from "@/lib/api/properties.types";

type Props = {
  rows: PropertyRow[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  sort: PropertiesSortField;
  direction: "asc" | "desc";
  onSortChange: (
    sort: PropertiesSortField,
    dir: "asc" | "desc",
  ) => void;
  onPageChange: (page: number) => void;
  /** Selection plumbing — owned by the page client. */
  selectedIds: Set<string>;
  isAllSelected: boolean;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
};

const kindToTone: Record<PropertyKind, { thumb: string; chip: string }> = {
  office: { thumb: "bg-secondary-50 text-secondary-700", chip: "bg-secondary-50 text-secondary-700" },
  retail: { thumb: "bg-warning-50 text-warning-700", chip: "bg-warning-50 text-warning-700" },
  residential: { thumb: "bg-primary-50 text-primary-700", chip: "bg-primary-50 text-primary-700" },
  medical: { thumb: "bg-error-50 text-error-700", chip: "bg-error-50 text-error-700" },
  industrial: { thumb: "bg-neutral-100 text-neutral-700", chip: "bg-neutral-100 text-neutral-700" },
  other: { thumb: "bg-neutral-100 text-neutral-700", chip: "bg-neutral-100 text-neutral-700" },
};

const kindIcon: Record<PropertyKind, React.ReactNode> = {
  office: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x={3} y={7} width={18} height={14} rx={1} />
      <path d="M8 21V11M16 21V11M3 11h18M7 4l5-2 5 2" />
    </svg>
  ),
  retail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 9l9-6 9 6v12H3z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  residential: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 21V7l8-4 8 4v14" />
      <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" />
    </svg>
  ),
  medical: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x={3} y={3} width={18} height={18} rx={3} />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  industrial: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 21V7l6 4V7l6 4V7l6 4v10z" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x={3} y={3} width={18} height={18} rx={3} />
    </svg>
  ),
};

const teamLeadTone: Record<number, string> = {
  0: "bg-primary-500",
  1: "bg-warning-500",
  2: "bg-secondary-500",
  3: "bg-accent-600",
};

export function PropertiesTable({
  rows,
  loading,
  total,
  page,
  pageSize,
  sort,
  direction,
  onSortChange,
  onPageChange,
  selectedIds,
  isAllSelected,
  onToggleOne,
  onToggleAll,
}: Props) {
  const t = useTranslations("properties.table");
  const tKind = useTranslations("properties.kind");
  const tStatus = useTranslations("properties.status");
  const tBulk = useTranslations("bulk");

  const allSelected = isAllSelected;
  const partial = !allSelected && rows.some((r) => selectedIds.has(r.id));

  function clickSort(col: typeof sort) {
    if (sort === col) onSortChange(col, direction === "asc" ? "desc" : "asc");
    else onSortChange(col, "asc");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th width={42}>
                <input
                  type="checkbox"
                  aria-label={tBulk("selectAll")}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = partial;
                  }}
                  onChange={onToggleAll}
                  className="h-4 w-4 cursor-pointer accent-primary-500"
                />
              </Th>
              <Th
                sortable
                active={sort === "name"}
                direction={direction}
                onClick={() => clickSort("name")}
              >
                {t("objekt")}
              </Th>
              <Th>{t("type")}</Th>
              <Th
                sortable
                active={sort === "client"}
                direction={direction}
                onClick={() => clickSort("client")}
              >
                {t("client")}
              </Th>
              {/* `assignments` is computed client-side (last 7 days of
                  shifts) so it's not a sortable DB column today. Keep the
                  header non-clickable until a real materialised count
                  lands. */}
              <Th>{t("assignments")}</Th>
              <Th>{t("status")}</Th>
              <Th>{t("teamLead")}</Th>
              <Th>{t("actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td colSpan={8} className="px-5 py-4">
                    <div className="h-9 animate-pulse rounded bg-neutral-100" />
                  </td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center text-[13px] text-neutral-500">
                  {t("empty")}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r, idx) => {
                const isSel = selectedIds.has(r.id);
                const tone = kindToTone[r.kind];
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b border-neutral-100 transition last:border-b-0 hover:bg-tertiary-200",
                      isSel && "bg-primary-50",
                    )}
                  >
                    <td className="px-5 py-3.5 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`${tBulk("selectAll")}: ${r.name}`}
                        checked={isSel}
                        onChange={() => onToggleOne(r.id)}
                        className="h-4 w-4 cursor-pointer accent-primary-500"
                      />
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <Link
                        href={routes.property(r.id)}
                        className="flex items-center gap-3"
                      >
                        <span
                          className={cn(
                            "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md",
                            tone.thumb,
                          )}
                        >
                          {kindIcon[r.kind]}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[13px] font-semibold text-neutral-800">
                            <span className="truncate">{r.name}</span>
                            {r.is_new && (
                              <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-white">
                                {t("newBadge")}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-neutral-500">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 flex-shrink-0">
                              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                              <circle cx={12} cy={10} r={3} />
                            </svg>
                            <span className="truncate">{r.address}</span>
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          tone.chip,
                        )}
                      >
                        {tKind(r.kind)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <Link
                        href={routes.client(r.client_id)}
                        className="text-[13px] font-medium text-primary-700 hover:underline"
                      >
                        {r.client_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-700">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3 w-3 text-neutral-400"
                        >
                          <rect x={3} y={5} width={18} height={16} rx={2} />
                          <path d="M3 9h18" />
                        </svg>
                        {t("perWeek", { count: r.assignments_per_week })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <StatusBadge status={r.status} t={tStatus} />
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      {r.team_lead_id ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={cn(
                              "grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white",
                              teamLeadTone[idx % 4],
                            )}
                          >
                            {r.team_lead_initials}
                          </span>
                          <span className="text-[12px] text-neutral-700">
                            {r.team_lead_name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[12px] italic text-neutral-400">
                          {t("unassigned")}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn href={routes.property(r.id)} title={t("actionView")}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                            <circle cx={12} cy={12} r={3} />
                          </svg>
                        </ActionBtn>
                        <ActionBtn href={routes.schedule} title={t("actionSchedule")}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <rect x={3} y={5} width={18} height={16} rx={2} />
                            <path d="M3 9h18M8 3v4M16 3v4" />
                          </svg>
                        </ActionBtn>
                        <ActionBtn title={t("actionMore")}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <circle cx={5} cy={12} r={1.5} />
                            <circle cx={12} cy={12} r={1.5} />
                            <circle cx={19} cy={12} r={1.5} />
                          </svg>
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3.5 text-[12px] text-neutral-500">
        <div>
          {t("showing", {
            from: total === 0 ? 0 : (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, total),
            total,
          })}
        </div>
        <Pagination page={page} totalPages={totalPages} onPage={onPageChange} />
      </div>
    </>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: PropertyStatus;
  t: (k: PropertyStatus) => string;
}) {
  const map: Record<PropertyStatus, string> = {
    active: "bg-success-50 text-success-700",
    onboarding: "bg-secondary-50 text-secondary-600",
    attention: "bg-warning-50 text-warning-700",
    paused: "bg-neutral-100 text-neutral-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.02em]",
        map[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t(status)}
    </span>
  );
}

function Th({
  children,
  width,
  sortable,
  active,
  direction,
  onClick,
}: {
  children?: React.ReactNode;
  width?: number;
  sortable?: boolean;
  active?: boolean;
  direction?: "asc" | "desc";
  onClick?: () => void;
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      style={width ? { width } : undefined}
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]",
        sortable
          ? "cursor-pointer select-none text-neutral-500 hover:text-neutral-800"
          : "text-neutral-500",
        active && "text-secondary-500",
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "h-2.5 w-2.5",
              active ? "text-secondary-500" : "text-neutral-300",
            )}
          >
            {active && direction === "desc" ? (
              <path d="M6 9l6 6 6-6" />
            ) : (
              <path d="M6 15l6-6 6 6" />
            )}
          </svg>
        )}
      </span>
    </th>
  );
}

function ActionBtn({
  href,
  title,
  children,
}: {
  href?: string;
  title: string;
  children: React.ReactNode;
}) {
  const className =
    "grid h-7 w-7 place-items-center rounded-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800";
  return href ? (
    <Link href={href as Route} title={title} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" title={title} className={className}>
      {children}
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const pages: (number | "…")[] = [];
  const add = (n: number) => {
    if (n >= 1 && n <= totalPages) pages.push(n);
  };
  add(1);
  if (page - 1 > 2) pages.push("…");
  add(page - 1);
  add(page);
  add(page + 1);
  if (page + 1 < totalPages - 1) pages.push("…");
  if (totalPages > 1) add(totalPages);
  const unique = pages.filter((v, i, arr) => arr.findIndex((x) => x === v) === i);

  return (
    <div className="flex items-center gap-1">
      <PageBtn disabled={page === 1} onClick={() => onPage(page - 1)}>
        ‹
      </PageBtn>
      {unique.map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} className="px-1 text-neutral-400">
            …
          </span>
        ) : (
          <PageBtn
            key={p}
            active={p === page}
            onClick={() => onPage(p as number)}
          >
            {p}
          </PageBtn>
        ),
      )}
      <PageBtn
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
      >
        ›
      </PageBtn>
    </div>
  );
}

function PageBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 min-w-[32px] place-items-center rounded-sm px-2 text-[12px] font-medium transition",
        disabled && "cursor-not-allowed opacity-40",
        !disabled &&
          (active
            ? "bg-primary-500 text-white"
            : "text-neutral-600 hover:bg-neutral-100"),
      )}
    >
      {children}
    </button>
  );
}
