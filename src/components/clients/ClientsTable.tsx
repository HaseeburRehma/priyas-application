"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import type { ClientRow } from "@/lib/api/clients.types";

type Props = {
  rows: ClientRow[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  sort: "name" | "properties" | "contract_start";
  direction: "asc" | "desc";
  onSortChange: (
    sort: "name" | "properties" | "contract_start",
    dir: "asc" | "desc",
  ) => void;
  onPageChange: (page: number) => void;
};

const TONES = ["primary", "secondary", "accent"] as const;
const toneClass: Record<(typeof TONES)[number], string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-600",
};

export function ClientsTable({
  rows,
  loading,
  total,
  page,
  pageSize,
  sort,
  direction,
  onSortChange,
  onPageChange,
}: Props) {
  const t = useTranslations("clients.table");
  const f = useFormat();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const partial = !allSelected && rows.some((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  function clickSort(col: typeof sort) {
    if (sort === col) {
      onSortChange(col, direction === "asc" ? "desc" : "asc");
    } else {
      onSortChange(col, "asc");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th width={42}>
                <button
                  type="button"
                  aria-label={t("selectAll")}
                  onClick={toggleAll}
                  className={cn(
                    "grid h-4 w-4 place-items-center rounded-[3px] border-[1.5px] bg-white",
                    allSelected || partial
                      ? "border-primary-500 bg-primary-500"
                      : "border-neutral-300",
                  )}
                >
                  {allSelected && (
                    <span className="block h-1 w-2 -translate-y-px translate-x-px rotate-[-45deg] border-b-2 border-l-2 border-white" />
                  )}
                  {partial && !allSelected && (
                    <span className="block h-0.5 w-2 bg-white" />
                  )}
                </button>
              </Th>
              <Th
                sortable
                active={sort === "name"}
                direction={direction}
                onClick={() => clickSort("name")}
              >
                {t("client")}
              </Th>
              <Th>{t("type")}</Th>
              <Th
                sortable
                active={sort === "properties"}
                direction={direction}
                onClick={() => clickSort("properties")}
              >
                {t("properties")}
              </Th>
              <Th>{t("status")}</Th>
              <Th
                sortable
                active={sort === "contract_start"}
                direction={direction}
                onClick={() => clickSort("contract_start")}
              >
                {t("contractStart")}
              </Th>
              <Th>{t("projectManager")}</Th>
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
                const isSel = selected.has(r.id);
                const tone = TONES[idx % TONES.length] ?? "primary";
                const initials = `C${idx + 1 + (page - 1) * pageSize}`;
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b border-neutral-100 transition last:border-b-0 hover:bg-tertiary-200",
                      isSel && "bg-primary-50",
                    )}
                  >
                    <td className="px-5 py-3.5 align-middle">
                      <button
                        type="button"
                        aria-label={`${t("selectRow")}: ${r.display_name}`}
                        onClick={() => toggle(r.id)}
                        className={cn(
                          "grid h-4 w-4 place-items-center rounded-[3px] border-[1.5px] bg-white",
                          isSel
                            ? "border-primary-500 bg-primary-500"
                            : "border-neutral-300",
                        )}
                      >
                        {isSel && (
                          <span className="block h-1 w-2 -translate-y-px translate-x-px rotate-[-45deg] border-b-2 border-l-2 border-white" />
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <Link
                        href={routes.client(r.id)}
                        className="flex items-center gap-3"
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
                            toneClass[tone],
                          )}
                        >
                          {initials}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[13px] font-semibold text-neutral-800">
                            <span className="truncate">{r.display_name}</span>
                            {r.is_new && (
                              <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-white">
                                {t("newBadge")}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                            {[r.email, r.phone].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <TypeChip type={r.customer_type} />
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-700">
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3 w-3 text-neutral-400"
                        >
                          <path d="M3 21V7l8-4 8 4v14" />
                        </svg>
                        {r.property_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span className="font-mono text-[12px] text-neutral-600">
                        {f.date(r.contract_start)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                          P1
                        </span>
                        <span className="text-[12px] text-neutral-700">
                          Projektleitung 01
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn href={routes.client(r.id)} title={t("actionView")}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                            <circle cx={12} cy={12} r={3} />
                          </svg>
                        </ActionBtn>
                        <ActionBtn href={routes.client(r.id)} title={t("actionEdit")}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </ActionBtn>
                        <ActionBtn title={t("actionMore")}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <circle cx={12} cy={5} r={1} />
                            <circle cx={12} cy={12} r={1} />
                            <circle cx={12} cy={19} r={1} />
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
        <Pagination
          page={page}
          totalPages={totalPages}
          onPage={onPageChange}
        />
      </div>
    </>
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
            aria-hidden
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

function TypeChip({
  type,
}: {
  type: "residential" | "commercial" | "alltagshilfe";
}) {
  const t = useTranslations("clients.toolbar");
  const map = {
    residential: {
      label: t("typePrivate"),
      className: "bg-secondary-50 text-secondary-600",
    },
    commercial: {
      label: t("typeCompany"),
      className: "bg-neutral-100 text-neutral-600",
    },
    alltagshilfe: {
      label: t("typeAlltagshilfe"),
      className: "bg-primary-50 text-primary-700",
    },
  } as const;
  const v = map[type];
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        v.className,
      )}
    >
      {v.label}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "review" | "onboarding" | "ended";
}) {
  const t = useTranslations("clients.status");
  const map = {
    active: {
      label: t("active"),
      className: "bg-success-50 text-success-700",
    },
    review: {
      label: t("review"),
      className: "bg-warning-50 text-warning-700",
    },
    onboarding: {
      label: t("onboarding"),
      className: "bg-secondary-50 text-secondary-600",
    },
    ended: {
      label: t("ended"),
      className: "bg-neutral-100 text-neutral-600",
    },
  } as const;
  const v = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.02em]",
        v.className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {v.label}
    </span>
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
    if (n < 1 || n > totalPages) return;
    pages.push(n);
  };
  add(1);
  if (page - 1 > 2) pages.push("…");
  add(page - 1);
  add(page);
  add(page + 1);
  if (page + 1 < totalPages - 1) pages.push("…");
  if (totalPages > 1) add(totalPages);
  // Dedupe
  const unique = pages.filter(
    (v, i, arr) => arr.findIndex((x) => x === v) === i,
  );

  return (
    <div className="flex items-center gap-1">
      <PageBtn disabled={page === 1} onClick={() => onPage(page - 1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <path d="M15 18l-6-6 6-6" />
        </svg>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <path d="M9 18l6-6-6-6" />
        </svg>
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
