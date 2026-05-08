"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useEmployees } from "@/hooks/employees/useEmployees";
import type {
  EmployeeRoleChip,
  EmployeeRow,
  EmployeeStatus,
  EmployeesSummary,
} from "@/lib/api/employees.types";
import { InviteEmployeeDialog } from "./InviteEmployeeDialog";

const PAGE_SIZE = 25;

type Props = { summary: EmployeesSummary; canCreate: boolean };

export function EmployeesPageClient({ summary, canCreate }: Props) {
  const t = useTranslations("employees");
  const tToolbar = useTranslations("employees.toolbar");
  const tSummary = useTranslations("employees.summary");
  const tTable = useTranslations("employees.table");
  const tRole = useTranslations("employees.role");
  const tStatus = useTranslations("employees.status");

  const [q, setQ] = useState("");
  const [role, setRole] = useState<EmployeeRoleChip | "all">("all");
  const [status, setStatus] = useState<EmployeeStatus | "all">("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading, isFetching } = useEmployees({
    q,
    role,
    status,
    page,
    pageSize: PAGE_SIZE,
    sort: "name",
    direction: "asc",
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      {/* Breadcrumb + page head */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbEmployees")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Import CSV is parked behind a tooltip until the importer
              ships; Export goes through /api/employees?format=csv (see
              that route handler). */}
          <button
            type="button"
            disabled
            title={t("actions.importComingSoon")}
            className="btn btn--ghost border border-neutral-200 bg-white opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
            </svg>
            {t("actions.import")}
          </button>
          <a
            href="/api/employees?format=csv"
            target="_blank"
            rel="noopener"
            className="btn btn--tertiary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
            </svg>
            {t("actions.export")}
          </a>
          {canCreate && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="btn btn--primary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("actions.invite")}
            </button>
          )}
        </div>
      </div>

      <InviteEmployeeDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={tSummary("total")}
          value={summary.total}
          sub={
            summary.newThisMonth > 0
              ? tSummary("totalDelta", { count: summary.newThisMonth })
              : tSummary("totalNone")
          }
          tone={summary.newThisMonth > 0 ? "up" : "muted"}
        />
        <SummaryCard
          label={tSummary("active")}
          value={summary.activeToday}
          sub={tSummary("activeSub")}
        />
        <SummaryCard
          label={tSummary("leave")}
          value={summary.onLeave}
          sub={tSummary("leaveSub")}
          tone="warn"
        />
        <SummaryCard
          label={tSummary("onboarding")}
          value={summary.pendingOnboarding}
          // Show the real first-pending employee when we have one;
          // fall back to "no mandatory training pending" copy when 0.
          sub={
            summary.pendingOnboarding > 0
              ? (summary.pendingOnboardingPreview ?? tSummary("onboardingSub"))
              : tSummary("onboardingNonePending")
          }
          tone="up"
        />
      </div>

      {/* Toolbar + Table */}
      <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="flex min-w-[240px] flex-1 items-center gap-2.5 rounded-md border border-neutral-100 bg-neutral-50 px-3.5 py-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-neutral-400">
              <circle cx={11} cy={11} r={7} />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={tToolbar("searchPlaceholder")}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-800 outline-none placeholder:text-neutral-400"
            />
          </div>
          <FilterChip
            label={role === "all" ? tToolbar("filterRole") : tRole(role)}
            count={role !== "all" ? 1 : undefined}
            active={role !== "all"}
            onClick={() => {
              const order: (EmployeeRoleChip | "all")[] = [
                "all",
                "pm",
                "field",
                "trainee",
              ];
              setRole(order[(order.indexOf(role) + 1) % order.length] ?? "all");
              setPage(1);
            }}
          />
          <FilterChip label={tToolbar("filterTeam")} />
          <FilterChip
            label={status === "all" ? tToolbar("filterStatus") : tStatus(status as never)}
            active={status !== "all"}
            onClick={() => {
              const order: (EmployeeStatus | "all")[] = [
                "all",
                "active",
                "on_leave",
                "inactive",
              ];
              setStatus(order[(order.indexOf(status) + 1) % order.length] ?? "all");
              setPage(1);
            }}
          />
          <FilterChip label={tToolbar("filterLanguage")} />
          <FilterChip label={tToolbar("filterMore")} />
          <div className="flex-1" />
          <div className="inline-flex rounded-md border border-neutral-100 bg-neutral-50 p-1 text-[12px]">
            <Seg active={view === "list"} onClick={() => setView("list")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <line x1={3} y1={6} x2={21} y2={6} />
                <line x1={3} y1={12} x2={21} y2={12} />
                <line x1={3} y1={18} x2={21} y2={18} />
              </svg>
              {tToolbar("viewList")}
            </Seg>
            <Seg active={view === "grid"} onClick={() => setView("grid")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <rect x={3} y={3} width={7} height={7} />
                <rect x={14} y={3} width={7} height={7} />
                <rect x={3} y={14} width={7} height={7} />
                <rect x={14} y={14} width={7} height={7} />
              </svg>
              {tToolbar("viewGrid")}
            </Seg>
          </div>
        </div>

        {/* Table */}
        {view === "list" ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th width={42} />
                  <Th>{tTable("employee")}</Th>
                  <Th>{tTable("role")}</Th>
                  <Th>{tTable("team")}</Th>
                  <Th>{tTable("hoursWeek")}</Th>
                  <Th>{tTable("status")}</Th>
                  <Th>{tTable("vacationBalance")}</Th>
                  <Th>{tTable("actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {(isLoading || isFetching) &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="h-9 animate-pulse rounded bg-neutral-100" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && !isFetching && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-[13px] text-neutral-500">
                      {tTable("empty")}
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  !isFetching &&
                  rows.map((r) => <Row key={r.id} row={r} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-[13px] text-neutral-500">
            {tToolbar("viewGrid")} —{" "}
            <span className="text-neutral-400">soon</span>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3.5 text-[12px] text-neutral-500">
          <div>
            {tTable("showing", {
              from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, total),
              total,
            })}
          </div>
          <div className="flex items-center gap-1">
            <PageBtn disabled={page === 1} onClick={() => setPage(page - 1)}>
              ‹
            </PageBtn>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <PageBtn
                  key={p}
                  active={p === page}
                  onClick={() => setPage(p)}
                >
                  {p}
                </PageBtn>
              );
            })}
            <PageBtn
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              ›
            </PageBtn>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ row }: { row: EmployeeRow }) {
  const tTable = useTranslations("employees.table");
  const tRole = useTranslations("employees.role");
  const tStatus = useTranslations("employees.status");

  const toneClass: Record<EmployeeRow["tone"], string> = {
    primary: "bg-primary-500",
    secondary: "bg-secondary-500",
    accent: "bg-accent-600",
    warning: "bg-warning-500",
  };
  const teamSwClass: Record<NonNullable<EmployeeRow["team_tone"]>, string> = {
    primary: "bg-primary-500",
    secondary: "bg-secondary-500",
    warning: "bg-warning-500",
  };
  const roleChipClass: Record<EmployeeRoleChip, string> = {
    pm: "bg-primary-50 text-primary-700",
    field: "bg-secondary-50 text-secondary-700",
    trainee: "bg-warning-50 text-warning-700",
  };

  // Build a localised "DE · EN · Projektleitung seit 2026" string
  // client-side using the same translation table that powers the
  // role chip. Replaces the previous server-built English fragment.
  const langs = row.languages.map((l) => l.toUpperCase()).join(" · ");
  const roleWord = tRole(row.role_chip);
  const metaParts = [langs, roleWord];
  if (row.hire_year !== null) {
    metaParts.push(tTable("metaSince", { year: row.hire_year }));
  }
  const meta = metaParts.filter(Boolean).join(" · ");

  const pct = Math.min(
    150,
    Math.round((row.hours_this_week / row.weekly_target) * 100),
  );
  const overtime = row.status === "overtime";

  return (
    <tr className="border-b border-neutral-100 transition last:border-b-0 hover:bg-tertiary-200">
      <td className="px-5 py-3.5 align-middle">
        <span className="grid h-4 w-4 place-items-center rounded-[3px] border-[1.5px] border-neutral-300 bg-white" />
      </td>
      <td className="px-5 py-3.5 align-middle">
        <Link
          href={routes.employee(row.id)}
          className="flex items-center gap-3"
        >
          <span
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[12px] font-bold text-white",
              toneClass[row.tone],
            )}
          >
            {row.initials}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-neutral-800">
              <span className="truncate">{row.full_name}</span>
              {row.med_cert && (
                <span className="rounded-full bg-error-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-error-700">
                  {tTable("medCert")}
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
              {meta}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-5 py-3.5 align-middle">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
            roleChipClass[row.role_chip],
          )}
        >
          {tRole(row.role_chip)}
        </span>
      </td>
      <td className="px-5 py-3.5 align-middle">
        {row.team_label && row.team_tone ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-700">
            <span className={cn("h-2 w-2 rounded-full", teamSwClass[row.team_tone])} />
            {row.team_label}
          </span>
        ) : (
          <span className="text-[12px] text-neutral-400">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 align-middle">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-neutral-800">
            {row.hours_this_week}h
          </span>
          <span className="text-[11px] text-neutral-500">
            {tTable("ofTarget", { target: row.weekly_target })}
          </span>
        </div>
        <div className="mt-1 h-1 max-w-[180px] overflow-hidden rounded-full bg-neutral-100">
          <div
            className={cn(
              "h-full rounded-full",
              overtime
                ? "bg-error-500"
                : pct >= 90
                  ? "bg-warning-500"
                  : "bg-primary-500",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </td>
      <td className="px-5 py-3.5 align-middle">
        <StatusBadge status={row.status} t={tStatus} />
      </td>
      <td className="px-5 py-3.5 align-middle">
        <div className="text-[13px] font-semibold text-neutral-800">
          {row.vacation_total - row.vacation_used} / {row.vacation_total}
        </div>
        <div className="text-[11px] text-neutral-500">
          {tTable("daysAvailable")}
        </div>
      </td>
      <td className="px-5 py-3.5 align-middle">
        <div className="flex items-center justify-end gap-1">
          <ActionBtn href={routes.chat} title={tTable("actionMessage")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
            </svg>
          </ActionBtn>
          <ActionBtn href={routes.schedule} title={tTable("actionSchedule")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x={3} y={5} width={18} height={16} rx={2} />
              <path d="M3 9h18M8 3v4M16 3v4" />
            </svg>
          </ActionBtn>
          <ActionBtn title={tTable("actionMore")}>
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
}

function StatusBadge({
  status,
  t,
}: {
  status: EmployeeStatus | "overtime";
  t: (k: EmployeeStatus | "overtime") => string;
}) {
  const map: Record<EmployeeStatus | "overtime", string> = {
    active: "bg-success-50 text-success-700",
    on_leave: "bg-secondary-50 text-secondary-600",
    inactive: "bg-neutral-100 text-neutral-600",
    overtime: "bg-error-50 text-error-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.02em]",
        map[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(status)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  sub: string;
  tone?: "up" | "warn" | "muted";
}) {
  const subColor =
    tone === "up"
      ? "text-success-500"
      : tone === "warn"
        ? "text-warning-700"
        : "text-neutral-500";
  return (
    <div className="rounded-md border border-neutral-100 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-bold tracking-[-0.01em] text-secondary-500">
        {value}
      </div>
      <div className={`mt-0.5 text-[11px] ${subColor}`}>{sub}</div>
    </div>
  );
}

function FilterChip({
  label,
  active = false,
  count,
  onClick,
}: {
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium transition",
        active
          ? "border-primary-500 bg-tertiary-200 text-primary-700"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-primary-500 hover:text-primary-600",
      )}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-primary-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition",
        active ? "bg-white text-secondary-500 shadow-xs" : "text-neutral-600",
      )}
    >
      {children}
    </button>
  );
}

function Th({
  children,
  width,
}: {
  children?: React.ReactNode;
  width?: number;
}) {
  return (
    <th
      style={width ? { width } : undefined}
      className="border-b border-neutral-200 bg-neutral-50 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500"
    >
      {children}
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
  const cls =
    "grid h-7 w-7 place-items-center rounded-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800";
  return href ? (
    <Link href={href as Route} title={title} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" title={title} className={cls}>
      {children}
    </button>
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
