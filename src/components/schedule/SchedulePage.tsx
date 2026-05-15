"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  getDay,
  subMonths,
  addMonths,
} from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { ScheduleWeek, ServiceLane, ShiftEvent } from "@/lib/api/schedule.types";
import {
  updateShiftAction,
  reassignShiftAction,
  completeShiftAction,
  cancelShiftAction,
  deleteShiftAction,
} from "@/app/actions/shifts";
import { ensureCalendarTokenAction } from "@/app/actions/calendar-token";
import { APP_TZ, getZonedParts, zonedTimeToUtc } from "@/lib/utils/i18n-format";
import { PlanShiftDialog } from "./PlanShiftDialog";
import { CheckInButton } from "./CheckInButton";
import type { ShiftOptionsResponse } from "@/app/api/shifts/options/route";

export type ScheduleView = "day" | "week" | "month" | "list";

type ViewerRole = "admin" | "dispatcher" | "employee" | null;

/**
 * Client-side mirror of the server-side RBAC matrix in
 * `src/lib/rbac/permissions.ts`. Used to gate detail-panel buttons. The
 * server action still re-checks via `requirePermission`, so this is purely
 * cosmetic — but matching the matrix keeps the UI honest.
 */
function canClient(role: ViewerRole, action: string): boolean {
  if (!role) return false;
  switch (action) {
    case "shift.update":
    case "shift.complete":
    case "shift.cancel":
      return role === "admin" || role === "dispatcher";
    case "shift.delete":
      return role === "admin";
    default:
      return false;
  }
}

const HOURS = Array.from({ length: 13 }, (_, i) => 6 + i); // 06–18
const dayNames = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
const dayNamesEN = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/**
 * Render a stored UTC ISO timestamp as "HH:mm" in the app's canonical
 * timezone (Europe/Berlin). Using `new Date(iso)` + local `getHours()` would
 * leak the browser's timezone into a tool that's used by a German service
 * — shifts would visually drift on travel.
 */
function formatBerlinTime(iso: string): string {
  const { hour, minute } = getZonedParts(new Date(iso), APP_TZ);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Return the yyyy-MM-dd string for a given UTC ISO timestamp, evaluated in
 * Europe/Berlin. Used to bucket a shift onto the correct day column.
 */
function berlinDayKey(iso: string): string {
  const { year, month, day } = getZonedParts(new Date(iso), APP_TZ);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Return the wall-clock hour-of-day in Europe/Berlin for a given UTC ISO
 * timestamp. Used to bucket a shift onto the correct hour row.
 */
function berlinHour(iso: string): number {
  return getZonedParts(new Date(iso), APP_TZ).hour;
}

type Props = {
  week: ScheduleWeek;
  /**
   * Which calendar view is active. The server resolves this from the
   * `?view=` query param and loads the appropriate date range.
   */
  view?: ScheduleView;
  /**
   * ISO timestamp of the focus date (today, or the date in `?date=`).
   * Used as the anchor for Day view, Month view, and the List view's
   * default sort cursor.
   */
  anchorIso?: string;
  viewerRole?: ViewerRole;
  /**
   * `employees.id` of the signed-in user (when they have one). Used
   * to decide whether the detail panel renders the CheckInButton — it
   * only shows on a shift assigned to the viewer themselves.
   */
  viewerEmployeeId?: string | null;
};

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

const laneColor: Record<ServiceLane, { bg: string; border: string; text: string; bar: string }> = {
  priyas: {
    bg: "bg-primary-50",
    border: "border-primary-300",
    text: "text-primary-700",
    bar: "bg-primary-500",
  },
  alltagshilfe: {
    bg: "bg-error-50",
    border: "border-error-100",
    text: "text-error-700",
    bar: "bg-error-500",
  },
};

const teamTone: Record<string, string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-600",
  warning: "bg-warning-500",
};

export function SchedulePage({
  week,
  view = "week",
  anchorIso,
  viewerRole = null,
  viewerEmployeeId = null,
}: Props) {
  const t = useTranslations("schedule");
  const locale = useLocale() as keyof typeof localeMap;
  const searchParams = useSearchParams();
  // `selectedId` persists across view switches so opening a shift in
  // List, then switching to Week, keeps that shift highlighted/expanded
  // in the detail panel — same selection across all views.
  const [selectedId, setSelectedId] = useState<string | null>(week.events[0]?.id ?? null);
  const [serviceFilter, setServiceFilter] = useState<"all" | ServiceLane>("all");
  const [statusFilter, setStatusFilter] = useState<Set<ShiftEvent["status"]>>(
    new Set(["completed", "scheduled", "in_progress"]),
  );
  // Employee filter — defaults to "all employees who have shifts in this
  // week's events". The Sidebar offers per-employee toggles. An empty set
  // is interpreted as "no employees selected" (hide every event); a set
  // covering all known employees is "show all" (the default).
  const allEmployeeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of week.events) for (const m of e.team) ids.add(m.id);
    return ids;
  }, [week.events]);
  const [employeeFilter, setEmployeeFilter] = useState<Set<string>>(
    () => new Set(allEmployeeIds),
  );
  // Re-sync the filter set whenever the visible week changes.
  useEffect(() => {
    setEmployeeFilter(new Set(allEmployeeIds));
  }, [allEmployeeIds]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();
  const [, dndStart] = useTransition();

  /**
   * Toolbar + mini-calendar navigation. The /schedule page reads `?date=`
   * server-side and feeds it into the right loader; pushing a new URL is
   * therefore the only thing we need to do here. Passing `null` navigates
   * back to "today" (no `date=` query param) so the page resolves the
   * anchor against `new Date()` again. Preserves the active `?view=`
   * search param so day-/month-/list-view navigation stays in-view.
   */
  function navigateToDate(date: Date | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (date === null) {
      params.delete("date");
    } else {
      params.set("date", format(date, "yyyy-MM-dd"));
    }
    const qs = params.toString();
    router.push(qs ? `/schedule?${qs}` : "/schedule");
  }

  /**
   * Switch active view via `?view=`. Uses `router.replace` so back-button
   * doesn't pile up "click Day, click Week, click Month" steps in history.
   * Default view (`week`) drops the param entirely so the URL stays clean.
   */
  function navigateToView(next: ScheduleView) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "week") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    const qs = params.toString();
    router.replace(qs ? `/schedule?${qs}` : "/schedule");
  }

  // Anchor used by the toolbar's prev/next/today buttons. For Week view we
  // pivot off the Monday of the displayed week; for Day/Month/List the
  // explicit `anchorIso` from the server is the source of truth (Week view
  // doesn't receive it because the server uses its own date math, but the
  // first day of `week.days` is always Monday for that case).
  const focusDate = anchorIso
    ? new Date(anchorIso)
    : week.days[0]
      ? new Date(week.days[0])
      : new Date();
  const weekAnchor = week.days[0]
    ? new Date(week.days[0])
    : focusDate;

  /**
   * Drag-and-drop handler — invoked when a shift block is dropped on a
   * different day/hour cell. Moves the shift while preserving its duration,
   * then refreshes via Next.js so the calendar reflects the new position.
   */
  function moveShift(shiftId: string, isoDay: string, hour: number) {
    const ev = week.events.find((e) => e.id === shiftId);
    if (!ev) return;
    // Compute the *Berlin* wall-clock duration + minute offset from the old
    // start. Using `new Date().get*()` here would pick up the browser's local
    // zone — wrong for any user not already in CEST/CET.
    const oldStartUtc = new Date(ev.starts_at);
    const oldEndUtc = new Date(ev.ends_at);
    const durationMs = oldEndUtc.getTime() - oldStartUtc.getTime();
    const oldStartBerlin = getZonedParts(oldStartUtc, APP_TZ);
    // `isoDay` is a yyyy-MM-dd string from the week-grid (already a Berlin
    // calendar day). Build the target Berlin wall-clock, then convert to UTC.
    const [y, m, d] = isoDay.split("-").map((s) => Number(s));
    if (!y || !m || !d) return;
    const newStartUtc = zonedTimeToUtc(y, m, d, hour, oldStartBerlin.minute, 0, APP_TZ);
    const newEndUtc = new Date(newStartUtc.getTime() + durationMs);
    const newStartIso = newStartUtc.toISOString();
    const newEndIso = newEndUtc.toISOString();
    if (newStartIso === ev.starts_at && newEndIso === ev.ends_at) {
      return; // no-op
    }
    dndStart(async () => {
      const r = await updateShiftAction({
        id: ev.id,
        property_id: ev.property_id,
        starts_at: newStartIso,
        ends_at: newEndIso,
        notes: ev.notes ?? "",
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("toast.moved", { default: "Shift moved." }));
      router.refresh();
    });
  }

  const visibleEvents = useMemo(
    () =>
      week.events.filter((e) => {
        if (serviceFilter !== "all" && e.service_lane !== serviceFilter) {
          return false;
        }
        if (!statusFilter.has(e.status)) return false;
        // If an event has no team members assigned (unassigned shift), let
        // it through — otherwise we'd silently hide unstaffed shifts the
        // dispatcher needs to see.
        if (e.team.length === 0) return true;
        // Otherwise show the event if any of its team members is in the
        // active filter set.
        return e.team.some((m) => employeeFilter.has(m.id));
      }),
    [week.events, serviceFilter, statusFilter, employeeFilter],
  );

  const selected = visibleEvents.find((e) => e.id === selectedId) ?? visibleEvents[0] ?? null;

  return (
    <>
      {/* Breadcrumb + page head */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbSchedule")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ExportMenu anchorDate={week.days[0] ?? null} />
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="btn btn--ghost border border-neutral-200 bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("actions.newAssignment")}
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="btn btn--primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x={3} y={5} width={18} height={16} rx={2} />
              <path d="M3 9h18M8 3v4M16 3v4" />
            </svg>
            {t("actions.planShift")}
          </button>
        </div>
      </div>

      <PlanShiftDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultDate={week.days[0] ?? undefined}
      />

      {/* Toolbar — view tabs + range label + service + filters. The
          prev/next arrows shift by 1 day in Day view, 7 days in Week view,
          1 month in Month view; the toolbar is hidden entirely in List
          view since chronological scrolling, not paging, drives that one. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-100 bg-white p-3">
        <button
          type="button"
          aria-label={
            view === "day"
              ? t("day.prevDay")
              : view === "month"
                ? t("sidebar.prevMonth")
                : t("prevWeek")
          }
          onClick={() => {
            if (view === "day") navigateToDate(addDays(focusDate, -1));
            else if (view === "month") navigateToDate(subMonths(focusDate, 1));
            else if (view === "list") navigateToDate(subMonths(focusDate, 1));
            else navigateToDate(addDays(weekAnchor, -7));
          }}
          className="btn btn--ghost border border-neutral-200 bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="text-[13px] font-semibold text-neutral-800">
          {view === "day"
            ? format(focusDate, "EEEE, d. MMM yyyy", {
                locale: localeMap[locale],
              })
            : view === "month"
              ? format(focusDate, "MMMM yyyy", { locale: localeMap[locale] })
              : view === "list"
                ? t("list.title")
                : week.weekLabel}
        </div>
        <button
          type="button"
          aria-label={
            view === "day"
              ? t("day.nextDay")
              : view === "month"
                ? t("sidebar.nextMonth")
                : t("nextWeek")
          }
          onClick={() => {
            if (view === "day") navigateToDate(addDays(focusDate, 1));
            else if (view === "month") navigateToDate(addMonths(focusDate, 1));
            else if (view === "list") navigateToDate(addMonths(focusDate, 1));
            else navigateToDate(addDays(weekAnchor, 7));
          }}
          className="btn btn--ghost border border-neutral-200 bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => navigateToDate(null)}
          className="btn btn--tertiary text-[12px]"
        >
          {t("today")}
        </button>

        {/* View tabs — clicking switches `?view=` and reloads the page
            with the right server-side loader. */}
        <div className="ml-3 inline-flex rounded-md border border-neutral-100 bg-neutral-50 p-1 text-[12px]">
          <Tab active={view === "day"} onClick={() => navigateToView("day")}>
            {t("tabs.day")}
          </Tab>
          <Tab active={view === "week"} onClick={() => navigateToView("week")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x={3} y={5} width={18} height={16} rx={2} />
              <path d="M3 9h18" />
            </svg>
            {t("tabs.week")}
          </Tab>
          <Tab active={view === "month"} onClick={() => navigateToView("month")}>
            {t("tabs.month")}
          </Tab>
          <Tab active={view === "list"} onClick={() => navigateToView("list")}>
            {t("tabs.list")}
          </Tab>
        </div>

        {/* Service pills */}
        <div className="ml-2 flex items-center gap-1 rounded-md border border-neutral-100 bg-neutral-50 px-2 py-1 text-[11px]">
          <span className="font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("service")}
          </span>
          <ServicePill
            label={t("serviceAll")}
            count={week.events.length}
            active={serviceFilter === "all"}
            tone="neutral"
            onClick={() => setServiceFilter("all")}
          />
          <ServicePill
            label={t("servicePriya")}
            count={week.events.filter((e) => e.service_lane === "priyas").length}
            active={serviceFilter === "priyas"}
            tone="primary"
            onClick={() => setServiceFilter("priyas")}
          />
          <ServicePill
            label={t("serviceAlltagshilfe")}
            count={week.events.filter((e) => e.service_lane === "alltagshilfe").length}
            active={serviceFilter === "alltagshilfe"}
            tone="error"
            onClick={() => setServiceFilter("alltagshilfe")}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip label={`${t("filterTeam")} 3 / 5`} active />
          <Chip label={t("filterClient")} />
          <Chip label={t("filterStatus")} />
          <Chip label={t("filterMore")} />
        </div>
      </div>

      {/* Body: sidebar | main view | detail. The middle column swaps based
          on `view`; sidebar + detail panel are shared. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr_360px]">
        <Sidebar
          anchor={focusDate}
          events={week.events}
          statusFilter={statusFilter}
          onToggleStatus={(s) =>
            setStatusFilter((prev) => {
              const n = new Set(prev);
              if (n.has(s)) n.delete(s);
              else n.add(s);
              return n;
            })
          }
          employeeFilter={employeeFilter}
          onToggleEmployee={(id) =>
            setEmployeeFilter((prev) => {
              const n = new Set(prev);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onSelectAllEmployees={() =>
            setEmployeeFilter(new Set(allEmployeeIds))
          }
          onPickDate={navigateToDate}
        />

        {view === "week" && (
          <CalendarGrid
            week={week}
            events={visibleEvents}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onMove={moveShift}
            locale={locale}
          />
        )}
        {view === "day" && (
          <DayView
            focusDate={focusDate}
            events={visibleEvents}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onMove={moveShift}
            locale={locale}
          />
        )}
        {view === "month" && (
          <MonthView
            focusDate={focusDate}
            events={visibleEvents}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onPickDay={(d) => {
              navigateToDate(d);
              navigateToView("day");
            }}
            locale={locale}
          />
        )}
        {view === "list" && (
          <ListView
            events={visibleEvents}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            viewerEmployeeId={viewerEmployeeId}
            locale={locale}
          />
        )}

        <DetailPanel
          event={selected ?? null}
          t={t}
          viewerRole={viewerRole}
          viewerEmployeeId={viewerEmployeeId}
        />
      </div>
    </>
  );

  function Tab({
    active,
    onClick,
    children,
  }: {
    active?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition",
          active
            ? "bg-white text-secondary-500 shadow-xs"
            : "text-neutral-600 hover:text-secondary-500",
        )}
      >
        {children}
      </button>
    );
  }

  function Chip({ label, active = false }: { label: string; active?: boolean }) {
    return (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium",
          active
            ? "border-primary-500 bg-tertiary-200 text-primary-700"
            : "border-neutral-200 bg-white text-neutral-700",
        )}
      >
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    );
  }
}

function ServicePill({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: "primary" | "error" | "neutral";
  onClick: () => void;
}) {
  const dot =
    tone === "primary"
      ? "bg-primary-500"
      : tone === "error"
        ? "bg-error-500"
        : "bg-neutral-400";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
        active
          ? "border-secondary-500 bg-white text-secondary-700"
          : "border-transparent text-neutral-700 hover:bg-white",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
      <span className="text-[10px] text-neutral-500">{count}</span>
    </button>
  );
}

function Sidebar({
  anchor,
  events,
  statusFilter,
  onToggleStatus,
  employeeFilter,
  onToggleEmployee,
  onSelectAllEmployees,
  onPickDate,
}: {
  anchor: Date;
  events: ShiftEvent[];
  statusFilter: Set<ShiftEvent["status"]>;
  onToggleStatus: (s: ShiftEvent["status"]) => void;
  employeeFilter: Set<string>;
  onToggleEmployee: (id: string) => void;
  onSelectAllEmployees: () => void;
  onPickDate: (date: Date | null) => void;
}) {
  const t = useTranslations("schedule.sidebar");

  // The mini-calendar's visible month is local state — paging it back/forward
  // shouldn't auto-jump the calendar grid. The grid only moves when the user
  // clicks an actual day cell.
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(anchor));

  // If the parent anchor changes (toolbar prev/next/today), keep the
  // mini-calendar in the same month as the visible week unless the user
  // has paged it manually since the last anchor change.
  useEffect(() => {
    setViewMonth(startOfMonth(anchor));
  }, [anchor]);

  const monthStart = viewMonth;
  const monthEnd = endOfMonth(viewMonth);
  const offset = (getDay(monthStart) + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  // Real per-status counts derived from the visible week's events.
  const statusCounts = useMemo(() => {
    const c = {
      completed: 0,
      scheduled: 0,
      in_progress: 0,
      no_show: 0,
      cancelled: 0,
    } as Record<ShiftEvent["status"], number>;
    for (const e of events) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [events]);

  // Real per-employee aggregation — one row per distinct staff member who
  // has at least one shift in this week. Replaces the previously hard-coded
  // "Team 01 · Kern (12)" mocks.
  const employees = useMemo(() => {
    const map = new Map<
      string,
      { id: string; initials: string; tone: string; count: number }
    >();
    for (const e of events) {
      for (const m of e.team) {
        const existing = map.get(m.id);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(m.id, {
            id: m.id,
            initials: m.initials,
            tone: m.tone,
            count: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [events]);

  // Tone class for the small dot next to each employee row. Maps to
  // existing Tailwind tokens used elsewhere in the page.
  const toneClass: Record<string, string> = {
    primary: "bg-primary-500",
    secondary: "bg-secondary-500",
    accent: "bg-accent-600",
    warning: "bg-warning-500",
  };

  return (
    <aside className="flex flex-col gap-4">
      {/* Mini calendar */}
      <section className="rounded-lg border border-neutral-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between text-[12px] font-semibold text-neutral-700">
          {format(viewMonth, "MMMM yyyy")}
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={t("prevMonth")}
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-neutral-50"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={t("nextMonth")}
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-neutral-50"
            >
              ›
            </button>
          </div>
        </header>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-[0.05em] text-neutral-400">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[11px]">
          {cells.map((d, i) =>
            d === null ? (
              <span key={i} className="h-7" />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => onPickDate(d)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded text-[11px] transition",
                  d.toDateString() === anchor.toDateString()
                    ? "bg-primary-500 text-white"
                    : "text-neutral-700 hover:bg-neutral-50",
                )}
              >
                {d.getDate()}
              </button>
            ),
          )}
        </div>
      </section>

      {/* Employee filters — derived from week.events.team[] so the list
           reflects who is actually scheduled this week, not a static
           "Team 01 · Kern" mock. */}
      <section className="rounded-lg border border-neutral-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-neutral-800">
            {t("team")}
          </h4>
          <button
            type="button"
            onClick={onSelectAllEmployees}
            className="text-[11px] text-primary-600 hover:underline"
          >
            {t("teamAll")}
          </button>
        </header>
        {employees.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-200 px-3 py-4 text-center text-[11px] text-neutral-500">
            {t("teamEmpty")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {employees.map((em) => {
              const checked = employeeFilter.has(em.id);
              return (
                <label
                  key={em.id}
                  className="flex cursor-pointer items-center gap-2.5 text-[12px]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleEmployee(em.id)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 accent-primary-500"
                  />
                  <span
                    className={cn(
                      "grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[9px] font-bold text-white",
                      toneClass[em.tone] ?? "bg-neutral-400",
                    )}
                  >
                    {em.initials}
                  </span>
                  <span className="flex-1 truncate text-neutral-700">
                    {em.id.slice(0, 8)}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {em.count}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* Status filters */}
      <section className="rounded-lg border border-neutral-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-neutral-800">{t("status")}</h4>
          <span className="text-[11px] text-primary-600">{t("statusAll")}</span>
        </header>
        <div className="flex flex-col gap-2">
          <StatusRow
            color="bg-success-500"
            label={t("completed")}
            count={statusCounts.completed}
            active={statusFilter.has("completed")}
            onToggle={() => onToggleStatus("completed")}
          />
          <StatusRow
            color="bg-secondary-500"
            label={t("scheduled")}
            count={statusCounts.scheduled}
            active={statusFilter.has("scheduled")}
            onToggle={() => onToggleStatus("scheduled")}
          />
          <StatusRow
            color="bg-warning-500"
            label={t("running")}
            count={statusCounts.in_progress}
            active={statusFilter.has("in_progress")}
            onToggle={() => onToggleStatus("in_progress")}
          />
          <StatusRow
            color="bg-error-500"
            label={t("missedOverdue")}
            count={statusCounts.no_show}
            active={statusFilter.has("no_show")}
            onToggle={() => onToggleStatus("no_show")}
          />
        </div>
      </section>
    </aside>
  );
}

function StatusRow({
  color,
  label,
  count,
  active,
  onToggle,
}: {
  color: string;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[12px]">
      <input
        type="checkbox"
        checked={active}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-neutral-300 accent-primary-500"
      />
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", color)} />
      <span className="flex-1 text-neutral-700">{label}</span>
      <span className="text-[11px] text-neutral-400">{count}</span>
    </label>
  );
}

function CalendarGrid({
  week,
  events,
  selectedId,
  onSelect,
  onMove,
  locale,
}: {
  week: ScheduleWeek;
  events: ShiftEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (shiftId: string, isoDay: string, hour: number) => void;
  locale: keyof typeof localeMap;
}) {
  // Compute "today" only after mount — calling new Date() during render
  // produces a different value on the server vs client and causes a
  // hydration mismatch. Empty string on first paint, real date a frame later.
  // Stored as a Berlin yyyy-MM-dd key so it matches the week.days bucketing
  // regardless of the browser's timezone.
  const [today, setToday] = useState<string>("");
  useEffect(() => {
    setToday(berlinDayKey(new Date().toISOString()));
  }, []);

  // Helpers to figure out which closures/vacations apply to a given ISO day.
  const inRange = (day: string, start: string, end: string) =>
    day >= start && day <= end;
  const closuresOn = (day: string) =>
    week.closures.filter((c) => inRange(day, c.start_date, c.end_date));
  const vacationsOn = (day: string) =>
    week.vacations.filter((v) => inRange(day, v.start_date, v.end_date));
  const hasOverlay = week.days.some(
    (d) => closuresOn(d).length > 0 || vacationsOn(d).length > 0,
  );

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      {/* Day header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-100 bg-neutral-50">
        <div />
        {week.days.map((iso, i) => {
          const d = new Date(iso);
          // `today` and `iso` are both yyyy-MM-dd Berlin day keys — compare
          // as strings rather than via Date.toDateString() (which uses the
          // browser's local zone).
          const isToday = iso === today;
          const isWeekend = i >= 5;
          return (
            <div
              key={iso}
              className={cn(
                "px-2 py-2 text-center",
                isToday && "bg-primary-50",
                isWeekend && !isToday && "bg-neutral-100/40",
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                {locale === "en" ? dayNamesEN[i] : dayNames[i]}
              </div>
              <div
                className={cn(
                  "text-[14px] font-bold",
                  isToday ? "text-primary-700" : "text-neutral-800",
                )}
              >
                {format(d, "d", { locale: localeMap[locale] })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Overlay strip — closures + approved vacations for any day in the week. */}
      {hasOverlay && (
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-100 bg-neutral-50/40">
          <div className="px-2 py-1 text-right text-[9px] font-semibold uppercase tracking-[0.04em] text-neutral-400">
            Off
          </div>
          {week.days.map((iso) => {
            const cs = closuresOn(iso);
            const vs = vacationsOn(iso);
            return (
              <div
                key={iso}
                className="flex flex-col gap-0.5 border-l border-neutral-100 px-1 py-1"
              >
                {cs.map((c) => (
                  <span
                    key={c.id}
                    title={`${c.property_name} · ${c.reason}`}
                    className="truncate rounded bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold text-warning-700"
                  >
                    🚫 {c.property_name}
                  </span>
                ))}
                {vs.map((v) => (
                  <span
                    key={v.id}
                    title={`${v.employee_name} · vacation`}
                    className="truncate rounded bg-secondary-50 px-1.5 py-0.5 text-[9px] font-semibold text-secondary-700"
                  >
                    🏖 {v.employee_name}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid + events */}
      <div className="relative">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map((h) => (
            <Row
              key={h}
              hour={h}
              days={week.days}
              isToday={today}
              events={events}
              onSelect={onSelect}
              onMove={onMove}
              selectedId={selectedId}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({
  hour,
  days,
  isToday,
  events,
  selectedId,
  onSelect,
  onMove,
}: {
  hour: number;
  days: string[];
  isToday: string;
  events: ShiftEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (shiftId: string, isoDay: string, hour: number) => void;
}) {
  return (
    <>
      <div className="border-b border-r border-neutral-100 bg-neutral-50/40 px-2 py-3 text-right font-mono text-[10px] text-neutral-500">
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((iso, i) => {
        const dayEvents = events.filter((e) => {
          // Bucket by Berlin wall-clock — the column is a Berlin calendar day
          // and the row is a Berlin hour, so the event's UTC instant must be
          // interpreted in Berlin too. Mixing UTC date with local hour (the
          // pre-fix behaviour) would mis-place shifts across day boundaries.
          return berlinDayKey(e.starts_at) === iso && berlinHour(e.starts_at) === hour;
        });
        const isWeekend = i >= 5;
        // Both sides are yyyy-MM-dd Berlin day keys — see CalendarGrid above.
        const isTodayCol = iso === isToday;
        return (
          <div
            key={`${iso}-${hour}`}
            onDragOver={onMove ? (ev) => {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = "move";
              (ev.currentTarget as HTMLElement).classList.add("ring-2", "ring-primary-300");
            } : undefined}
            onDragLeave={onMove ? (ev) => {
              (ev.currentTarget as HTMLElement).classList.remove("ring-2", "ring-primary-300");
            } : undefined}
            onDrop={onMove ? (ev) => {
              ev.preventDefault();
              (ev.currentTarget as HTMLElement).classList.remove("ring-2", "ring-primary-300");
              const id = ev.dataTransfer.getData("text/shift-id");
              if (id) onMove(id, iso, hour);
            } : undefined}
            className={cn(
              "min-h-[64px] border-b border-r border-neutral-100 p-1",
              isTodayCol && "bg-primary-50/30",
              isWeekend && !isTodayCol && "bg-neutral-100/30",
            )}
          >
            {dayEvents.map((e) => (
              <Event
                key={e.id}
                event={e}
                selected={e.id === selectedId}
                onClick={() => onSelect(e.id)}
                draggable={!!onMove}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function Event({
  event,
  selected,
  onClick,
  draggable,
}: {
  event: ShiftEvent;
  selected: boolean;
  onClick: () => void;
  draggable?: boolean;
}) {
  const c = laneColor[event.service_lane];
  const start = formatBerlinTime(event.starts_at);
  const end = formatBerlinTime(event.ends_at);
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData("text/shift-id", event.id);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      className={cn(
        "block w-full rounded-md border px-2 py-1.5 text-left transition",
        c.bg,
        c.border,
        selected ? "ring-2 ring-secondary-500" : "hover:shadow-sm",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className={cn("text-[10px] font-mono font-semibold", c.text)}>
        {start} – {end}
      </div>
      <div className="truncate text-[12px] font-semibold text-neutral-800">
        {event.title}
      </div>
      <div className="truncate text-[10px] text-neutral-500">
        {event.client_name}
      </div>
      <div className="mt-1 flex">
        {event.team.slice(0, 3).map((m, idx) => (
          <span
            key={m.id}
            className={cn(
              "grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white",
              teamTone[m.tone],
              idx > 0 && "-ml-1",
            )}
            style={{ border: "1.5px solid white" }}
          >
            {m.initials}
          </span>
        ))}
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Day view — single-day vertical timeline (06:00–22:00).
 *
 * Mirrors the Week-view grid's HOURS row math + drag-drop, just with a
 * single column. Reuses `Event` for the card and `moveShift` (passed in
 * as `onMove`) for the drag-drop transition. Drop targets are constrained
 * to the focused day; dropping in a different day-cell isn't possible
 * because there's only one column.
 * ----------------------------------------------------------------------- */
function DayView({
  focusDate,
  events,
  selectedId,
  onSelect,
  onMove,
  locale,
}: {
  focusDate: Date;
  events: ShiftEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (shiftId: string, isoDay: string, hour: number) => void;
  locale: keyof typeof localeMap;
}) {
  const t = useTranslations("schedule");
  // Berlin day key for the column — the events array is bucketed against
  // this string, NOT against `format(focusDate, "yyyy-MM-dd")`. The focus
  // date is a browser-local Date; if the user is in a non-Berlin zone, a
  // direct format() would key the wrong yyyy-MM-dd on day boundaries.
  const focusKey = useMemo(() => {
    // Use the focus date's Berlin parts at midday (12:00) so a Berlin-day
    // boundary doesn't flip the key based on the user's local zone.
    const noonUtc = zonedTimeToUtc(
      focusDate.getFullYear(),
      focusDate.getMonth() + 1,
      focusDate.getDate(),
      12,
      0,
      0,
      APP_TZ,
    );
    return berlinDayKey(noonUtc.toISOString());
  }, [focusDate]);

  // "Today" badge — computed client-side to avoid SSR/CSR drift, same as
  // the week grid.
  const [todayKey, setTodayKey] = useState<string>("");
  useEffect(() => {
    setTodayKey(berlinDayKey(new Date().toISOString()));
  }, []);
  const isToday = focusKey === todayKey;

  const dayEvents = useMemo(
    () => events.filter((e) => berlinDayKey(e.starts_at) === focusKey),
    [events, focusKey],
  );

  const hours = Array.from({ length: 17 }, (_, i) => 6 + i); // 06..22

  // Sub-zoned focus Date for header display — see week grid for the same
  // pattern (we want "Donnerstag, 12. Mai" rendered against Berlin parts).
  const focusBerlin = useMemo(() => {
    const p = getZonedParts(focusDate, APP_TZ);
    return new Date(p.year, p.month - 1, p.day, p.hour, p.minute);
  }, [focusDate]);

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {format(focusBerlin, "EEEE", { locale: localeMap[locale] })}
          </div>
          <div className="text-[16px] font-bold text-secondary-500">
            {format(focusBerlin, "d. MMMM yyyy", {
              locale: localeMap[locale],
            })}
          </div>
        </div>
        {isToday && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-primary-700">
            {t("today")}
          </span>
        )}
      </header>

      {dayEvents.length === 0 ? (
        <div className="px-6 py-12 text-center text-[13px] text-neutral-500">
          {t("day.empty", {
            date: format(focusBerlin, "d. MMM", {
              locale: localeMap[locale],
            }),
          })}
        </div>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-[60px_1fr]">
            {hours.map((h) => {
              const cellEvents = dayEvents.filter(
                (e) => berlinHour(e.starts_at) === h,
              );
              return (
                <DayRow
                  key={h}
                  hour={h}
                  isoDay={focusKey}
                  events={cellEvents}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onMove={onMove}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function DayRow({
  hour,
  isoDay,
  events,
  selectedId,
  onSelect,
  onMove,
}: {
  hour: number;
  isoDay: string;
  events: ShiftEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (shiftId: string, isoDay: string, hour: number) => void;
}) {
  return (
    <>
      <div className="border-b border-r border-neutral-100 bg-neutral-50/40 px-2 py-3 text-right font-mono text-[10px] text-neutral-500">
        {String(hour).padStart(2, "0")}:00
      </div>
      <div
        onDragOver={onMove ? (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          (ev.currentTarget as HTMLElement).classList.add("ring-2", "ring-primary-300");
        } : undefined}
        onDragLeave={onMove ? (ev) => {
          (ev.currentTarget as HTMLElement).classList.remove("ring-2", "ring-primary-300");
        } : undefined}
        onDrop={onMove ? (ev) => {
          ev.preventDefault();
          (ev.currentTarget as HTMLElement).classList.remove("ring-2", "ring-primary-300");
          const id = ev.dataTransfer.getData("text/shift-id");
          if (id) onMove(id, isoDay, hour);
        } : undefined}
        className="min-h-[64px] border-b border-neutral-100 p-1.5"
      >
        {events.map((e) => (
          <Event
            key={e.id}
            event={e}
            selected={e.id === selectedId}
            onClick={() => onSelect(e.id)}
            draggable={!!onMove}
          />
        ))}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Month view — 7×~6 grid (Mon-first per DE convention). Each cell shows up
 * to 3 colored chips for that day; overflow folds into a "+N more" link
 * that opens the day in Day view. Clicking a chip selects the shift; the
 * shared DetailPanel renders it.
 * ----------------------------------------------------------------------- */
function MonthView({
  focusDate,
  events,
  selectedId,
  onSelect,
  onPickDay,
  locale,
}: {
  focusDate: Date;
  events: ShiftEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPickDay: (d: Date) => void;
  locale: keyof typeof localeMap;
}) {
  const t = useTranslations("schedule");
  const monthStart = startOfMonth(focusDate);
  const monthEnd = endOfMonth(focusDate);
  // Pad to whole Mon..Sun weeks so the visible grid shows the standard
  // greyed-out tails from the surrounding months.
  const offset = (getDay(monthStart) + 6) % 7;
  const totalDays = monthEnd.getDate();
  const rows = Math.ceil((offset + totalDays) / 7);
  const cells: Date[] = [];
  const gridStart = addDays(monthStart, -offset);
  for (let i = 0; i < rows * 7; i++) {
    cells.push(addDays(gridStart, i));
  }

  const [todayKey, setTodayKey] = useState<string>("");
  useEffect(() => {
    setTodayKey(berlinDayKey(new Date().toISOString()));
  }, []);

  // Bucket the visible events by Berlin yyyy-MM-dd so each cell's lookup
  // is O(1). Re-derives only when the events array or its identities
  // change.
  const byDay = useMemo(() => {
    const map = new Map<string, ShiftEvent[]>();
    for (const e of events) {
      const k = berlinDayKey(e.starts_at);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    // Sort each bucket by start time so the first 3 chips are deterministic.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [events]);

  const weekdayLabels = locale === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : locale === "ta"
      ? ["திங்", "செவ்", "புத", "வியா", "வெள்", "சனி", "ஞாயி"]
      : ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-100 bg-neutral-50 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {weekdayLabels.map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid grid-cols-7"
        style={{
          gridAutoRows: "minmax(110px, 1fr)",
        }}
      >
        {cells.map((d, idx) => {
          // Use the Berlin yyyy-MM-dd key (the events index is bucketed
          // that way). A direct `format(d, "yyyy-MM-dd")` would key
          // against the browser's local zone — fine in CET, wrong at
          // boundaries for anyone outside it.
          const noon = zonedTimeToUtc(
            d.getFullYear(),
            d.getMonth() + 1,
            d.getDate(),
            12,
            0,
            0,
            APP_TZ,
          );
          const key = berlinDayKey(noon.toISOString());
          const inMonth = d.getMonth() === focusDate.getMonth();
          const isToday = key === todayKey;
          const dayEvents = byDay.get(key) ?? [];
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={idx}
              className={cn(
                "flex min-h-[110px] flex-col gap-1 border-b border-r border-neutral-100 p-1.5",
                !inMonth && "bg-neutral-50/60",
              )}
            >
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className={cn(
                  "self-start rounded px-1.5 text-[11px] font-semibold transition",
                  isToday
                    ? "bg-primary-500 text-white"
                    : inMonth
                      ? "text-neutral-800 hover:bg-neutral-100"
                      : "text-neutral-400 hover:bg-neutral-100",
                )}
                aria-label={format(d, "EEEE, d. MMMM yyyy", {
                  locale: localeMap[locale],
                })}
              >
                {format(d, "d", { locale: localeMap[locale] })}
              </button>
              <div className="flex flex-col gap-0.5">
                {visible.map((e) => (
                  <MonthChip
                    key={e.id}
                    event={e}
                    selected={e.id === selectedId}
                    onClick={() => onSelect(e.id)}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onPickDay(d)}
                    className="self-start rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 hover:bg-neutral-100"
                  >
                    {t("month.more", { count: overflow })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthChip({
  event,
  selected,
  onClick,
}: {
  event: ShiftEvent;
  selected: boolean;
  onClick: () => void;
}) {
  const lane = laneColor[event.service_lane];
  // Status-driven left border so a chip carries both lane + status signal.
  const statusBar =
    event.status === "completed"
      ? "before:bg-success-500"
      : event.status === "cancelled" || event.status === "no_show"
        ? "before:bg-error-500"
        : event.status === "in_progress"
          ? "before:bg-warning-500"
          : "before:bg-secondary-500";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full truncate rounded px-1.5 py-0.5 pl-2 text-left text-[10px] font-medium transition",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l",
        lane.bg,
        lane.text,
        statusBar,
        selected && "ring-1 ring-secondary-500",
      )}
    >
      <span className="font-mono">{formatBerlinTime(event.starts_at)}</span>{" "}
      <span className="truncate">{event.title}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------
 * List view — chronological table with sticky day headers, pagination,
 * "my shifts only" filter and a Date sort toggle.
 * ----------------------------------------------------------------------- */
function ListView({
  events,
  selectedId,
  onSelect,
  viewerEmployeeId,
  locale,
}: {
  events: ShiftEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  viewerEmployeeId: string | null;
  locale: keyof typeof localeMap;
}) {
  const t = useTranslations("schedule");
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [sortDesc, setSortDesc] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  // Reset to page 0 whenever the filter/sort changes so the user isn't
  // staring at an empty page 7.
  useEffect(() => {
    setPage(0);
  }, [sortDesc, onlyMine, events.length]);

  const filtered = useMemo(() => {
    let arr = events.slice();
    if (onlyMine && viewerEmployeeId) {
      arr = arr.filter((e) => e.employee_id === viewerEmployeeId);
    }
    arr.sort((a, b) =>
      sortDesc
        ? b.starts_at.localeCompare(a.starts_at)
        : a.starts_at.localeCompare(b.starts_at),
    );
    return arr;
  }, [events, sortDesc, onlyMine, viewerEmployeeId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  // Compute day boundaries for the visible page so we can emit a sticky
  // header row between groups. Bucket key is the Berlin yyyy-MM-dd of the
  // *start* of the shift.
  type RowItem =
    | { kind: "header"; key: string; dateLabel: string }
    | { kind: "shift"; event: ShiftEvent };
  const items: RowItem[] = [];
  let lastKey = "";
  for (const e of pageRows) {
    const key = berlinDayKey(e.starts_at);
    if (key !== lastKey) {
      const p = getZonedParts(new Date(e.starts_at), APP_TZ);
      const display = new Date(p.year, p.month - 1, p.day);
      items.push({
        kind: "header",
        key,
        dateLabel: format(display, "EEEE, d. MMM yyyy", {
          locale: localeMap[locale],
        }),
      });
      lastKey = key;
    }
    items.push({ kind: "shift", event: e });
  }

  const statusToneClass: Record<ShiftEvent["status"], string> = {
    completed: "bg-success-50 text-success-700",
    scheduled: "bg-secondary-50 text-secondary-700",
    in_progress: "bg-warning-50 text-warning-700",
    cancelled: "bg-error-50 text-error-700",
    no_show: "bg-error-50 text-error-700",
  };

  const statusLabel = (s: ShiftEvent["status"]) => {
    switch (s) {
      case "completed":
        return t("sidebar.completed");
      case "scheduled":
        return t("sidebar.scheduled");
      case "in_progress":
        return t("sidebar.running");
      case "cancelled":
        return t("list.statusCancelled");
      case "no_show":
        return t("sidebar.missedOverdue");
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-3">
        <div className="text-[12px] text-neutral-500">
          {t("list.count", { count: filtered.length })}
        </div>
        <div className="flex items-center gap-4">
          {viewerEmployeeId && (
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-neutral-700">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-300 accent-primary-500"
              />
              {t("list.onlyMine")}
            </label>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-neutral-100 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
              <th className="px-4 py-2">
                <button
                  type="button"
                  onClick={() => setSortDesc((v) => !v)}
                  className="inline-flex items-center gap-1 hover:text-secondary-500"
                  aria-label={t("list.sortByDate")}
                >
                  {t("list.colDate")}
                  <span aria-hidden>{sortDesc ? "▼" : "▲"}</span>
                </button>
              </th>
              <th className="px-4 py-2">{t("list.colTime")}</th>
              <th className="px-4 py-2">{t("list.colProperty")}</th>
              <th className="px-4 py-2">{t("list.colEmployee")}</th>
              <th className="px-4 py-2">{t("list.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-10 text-center text-[13px] text-neutral-500"
                >
                  {t("list.empty")}
                </td>
              </tr>
            )}
            {items.map((it) =>
              it.kind === "header" ? (
                <tr key={`h-${it.key}`} className="sticky bg-neutral-50">
                  <td
                    colSpan={5}
                    className="border-b border-t border-neutral-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600"
                  >
                    {it.dateLabel}
                  </td>
                </tr>
              ) : (
                <tr
                  key={it.event.id}
                  onClick={() => onSelect(it.event.id)}
                  className={cn(
                    "cursor-pointer border-b border-neutral-100 transition hover:bg-neutral-50",
                    selectedId === it.event.id && "bg-primary-50/50",
                  )}
                >
                  <td className="px-4 py-2 font-mono text-[11px] text-neutral-500">
                    {format(
                      (() => {
                        const p = getZonedParts(
                          new Date(it.event.starts_at),
                          APP_TZ,
                        );
                        return new Date(p.year, p.month - 1, p.day);
                      })(),
                      "dd.MM.yyyy",
                      { locale: localeMap[locale] },
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-neutral-700">
                    {formatBerlinTime(it.event.starts_at)} –{" "}
                    {formatBerlinTime(it.event.ends_at)}
                  </td>
                  <td className="px-4 py-2 font-medium text-neutral-800">
                    {it.event.property_name}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {it.event.team[0]?.initials ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                        statusToneClass[it.event.status],
                      )}
                    >
                      {statusLabel(it.event.status)}
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-[12px] text-neutral-600">
          <span>
            {t("list.pageOf", {
              page: safePage + 1,
              total: totalPages,
            })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="btn btn--ghost border border-neutral-200 bg-white text-[12px] disabled:opacity-40"
            >
              {t("list.prevPage")}
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="btn btn--ghost border border-neutral-200 bg-white text-[12px] disabled:opacity-40"
            >
              {t("list.nextPage")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailPanel({
  event,
  t,
  viewerRole,
  viewerEmployeeId,
}: {
  event: ShiftEvent | null;
  t: ReturnType<typeof useTranslations>;
  viewerRole: ViewerRole;
  viewerEmployeeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  if (!event) {
    return (
      <aside className="rounded-lg border border-neutral-100 bg-white p-6 text-center text-[13px] text-neutral-500">
        {t("empty")}
      </aside>
    );
  }
  const startDate = new Date(event.starts_at);
  const endDate = new Date(event.ends_at);
  const durationH = (endDate.getTime() - startDate.getTime()) / 3_600_000;
  // For *display* of weekday/date we need the Berlin wall-clock, not the
  // browser's. Construct a synthetic local Date whose local getters mirror
  // the Berlin parts so date-fns' `format` produces the right weekday.
  const startBerlin = getZonedParts(startDate, APP_TZ);
  const startDisplay = new Date(
    startBerlin.year,
    startBerlin.month - 1,
    startBerlin.day,
    startBerlin.hour,
    startBerlin.minute,
  );
  const lane = laneColor[event.service_lane];

  const canUpdate = canClient(viewerRole, "shift.update");
  const canComplete = canClient(viewerRole, "shift.complete");
  const canCancel = canClient(viewerRole, "shift.cancel");
  const canDelete = canClient(viewerRole, "shift.delete");

  // The completion/cancel verbs only make sense while the shift is still
  // open. Don't show a "mark completed" button on an already-completed row,
  // and don't allow re-cancelling a cancelled one.
  const isTerminal =
    event.status === "completed" || event.status === "cancelled";
  const showComplete = canComplete && !isTerminal;
  const showCancel = canCancel && !isTerminal;

  function handleComplete() {
    if (!event) return;
    if (!window.confirm(t("actions.confirmComplete"))) return;
    startTransition(async () => {
      const r = await completeShiftAction(event.id);
      if (!r.ok) {
        toast.error(r.error || t("toast.completeError"));
        return;
      }
      toast.success(t("toast.completed"));
      router.refresh();
    });
  }

  function handleCancel() {
    if (!event) return;
    if (!window.confirm(t("actions.confirmCancel"))) return;
    startTransition(async () => {
      const r = await cancelShiftAction(event.id);
      if (!r.ok) {
        toast.error(r.error || t("toast.cancelError"));
        return;
      }
      toast.success(t("toast.cancelled"));
      router.refresh();
    });
  }

  function handleDelete() {
    if (!event) return;
    if (!window.confirm(t("actions.confirmDelete"))) return;
    startTransition(async () => {
      const r = await deleteShiftAction(event.id);
      if (!r.ok) {
        toast.error(r.error || t("toast.deleteError"));
        return;
      }
      toast.success(t("toast.deleted"));
      router.refresh();
    });
  }

  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-neutral-100 bg-white p-5">
      <header className="flex items-start justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
            event.service_lane === "alltagshilfe"
              ? "bg-error-50 text-error-700"
              : "bg-primary-50 text-primary-700",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", lane.bar)} />
          {t("panel.scheduledTag")}
        </span>
        <button
          type="button"
          aria-label={t("panel.close")}
          className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-50"
        >
          <span aria-hidden>✕</span>
        </button>
      </header>

      <div>
        <div className="text-[18px] font-bold text-secondary-500">
          {event.title}
        </div>
        <div className="text-[12px] text-neutral-500">
          {format(startDisplay, "EEEE, d. MMM")} · {formatBerlinTime(event.starts_at)} – {formatBerlinTime(event.ends_at)}
        </div>
      </div>

      <dl className="divide-y divide-neutral-100 rounded-md border border-neutral-100">
        <DetailRow label={t("panel.client")} value={event.client_name} accent />
        <DetailRow label={t("panel.property")} value={event.property_name} accent />
        <DetailRow label={t("panel.service")} value="Cleaning" />
        <DetailRow
          label={t("panel.duration")}
          value={`${durationH.toFixed(durationH % 1 === 0 ? 0 : 1)}h`}
        />
        <DetailRow label={t("panel.costCenter")} value={`CC-${event.id.slice(0, 6).toUpperCase()}`} mono />
      </dl>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
          {t("panel.assignedTeam", { count: event.team.length })}
        </div>
        <div className="flex flex-col gap-2">
          {event.team.map((m, idx) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2"
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white",
                  teamTone[m.tone],
                )}
              >
                {m.initials}
              </span>
              <div className="flex-1 text-[12px]">
                <div className="font-semibold text-neutral-800">
                  {idx === 0 ? t("panel.teamLead") : t("panel.fieldStaff")}
                </div>
                <div className="text-neutral-500">{m.id.slice(0, 8)}</div>
              </div>
              {idx === 0 && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em] text-primary-700">
                  {t("panel.lead")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {event.notes && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("panel.notes")}
          </div>
          <p className="text-[12px] leading-[1.55] text-neutral-700">{event.notes}</p>
        </div>
      )}

      {/* Check-in / Check-out — only visible to the assignee on a live
          shift. Admins/dispatchers don't see this on someone else's
          shift (they can mark complete via the admin actions below).
          Status gates: "scheduled" → show "Check in" mode;
          "in_progress" → show "Check out" mode. Terminal statuses
          (completed/cancelled/no_show) hide the button entirely. */}
      {viewerEmployeeId &&
        event.employee_id === viewerEmployeeId &&
        (event.status === "scheduled" || event.status === "in_progress") && (
          <div className="mt-1 border-t border-neutral-100 pt-3">
            <CheckInButton
              shiftId={event.id}
              startsAt={event.starts_at}
              endsAt={event.ends_at}
              lastEntryKind={
                event.status === "in_progress" ? "check_in" : null
              }
              completed={false}
            />
          </div>
        )}

      {/* Action bar — server actions are still gated by requirePermission,
          so these buttons are purely cosmetic gating. Hidden when the role
          has none of the relevant permissions to keep the panel clean. */}
      {(canUpdate || canDelete) && (
        <div className="mt-1 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {canUpdate && (
            <button
              type="button"
              onClick={() => setReassignOpen(true)}
              disabled={pending}
              className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
            >
              {t("actions.reassign")}
            </button>
          )}
          {canUpdate && (
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              disabled={pending}
              className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
            >
              {t("actions.reschedule")}
            </button>
          )}
          {showComplete && (
            <button
              type="button"
              onClick={handleComplete}
              disabled={pending}
              className="btn btn--primary text-[12px]"
            >
              {t("actions.complete")}
            </button>
          )}
          {showCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="btn btn--tertiary border border-neutral-200 bg-white text-[12px]"
            >
              {t("actions.cancel")}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="btn btn--tertiary border border-error-200 bg-white text-[12px] text-error-700"
            >
              {t("actions.delete")}
            </button>
          )}
        </div>
      )}

      <ReassignDialog
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        event={event}
      />
      <RescheduleDialog
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        event={event}
      />
    </aside>
  );
}

function DetailRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 px-3 py-2 text-[12px]">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={cn(
          "text-right",
          mono ? "font-mono text-neutral-700" : accent ? "font-semibold text-neutral-800" : "text-neutral-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

void addDays;

/**
 * Modal: reassign a shift to a different employee. Loads /api/shifts/options
 * the first time it opens (same endpoint PlanShiftDialog uses), then posts
 * via `reassignShiftAction`. The action re-runs all conflict checks against
 * the new assignee, so the dialog can surface those as inline error text.
 */
function ReassignDialog({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event: ShiftEvent;
}) {
  const t = useTranslations("schedule");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [options, setOptions] = useState<ShiftOptionsResponse | null>(null);
  const [employeeId, setEmployeeId] = useState<string>(
    () => event.team[0]?.id ?? "",
  );
  const [error, setError] = useState<string>("");

  // Re-seed the selection whenever the parent swaps the underlying shift.
  useEffect(() => {
    setEmployeeId(event.team[0]?.id ?? "");
  }, [event.id, event.team]);

  // Lock background scroll + Esc-to-close while the modal is mounted, then
  // restore the previous overflow so we don't fight the rest of the app.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Fetch options lazily; same shape as PlanShiftDialog uses.
  useEffect(() => {
    if (!open || options) return;
    let cancelled = false;
    fetch("/api/shifts/options", { cache: "no-store" })
      .then((r) => r.json() as Promise<ShiftOptionsResponse>)
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {
        if (!cancelled) setError(t("toast.reassignError"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, options, t]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await reassignShiftAction({
        id: event.id,
        employee_id: employeeId || null,
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error || t("toast.reassignError"));
        return;
      }
      toast.success(t("toast.reassigned"));
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("actions.reassignTitle")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <h2 className="text-[18px] font-bold text-secondary-500">
            {t("actions.reassignTitle")}
          </h2>
          <button
            type="button"
            aria-label={t("dialog.cancel")}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <form onSubmit={submit} className="flex flex-col overflow-y-auto" noValidate>
          <div className="flex flex-col gap-4 p-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("actions.selectEmployee")}
              </span>
              <select
                className="input"
                value={employeeId}
                onChange={(ev) => setEmployeeId(ev.target.value)}
                disabled={!options}
              >
                <option value="">{t("dialog.noEmployee")}</option>
                {options?.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
              {error && (
                <span className="text-[12px] text-error-700">{error}</span>
              )}
            </label>
          </div>
          <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
            <button
              type="button"
              className="btn btn--ghost border border-neutral-200"
              onClick={onClose}
            >
              {t("dialog.cancel")}
            </button>
            <button
              type="submit"
              disabled={pending || !options}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? t("dialog.saving") : t("dialog.save")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal: reschedule a shift to a new date and start/end time. Pre-fills
 * the existing Berlin wall-clock values, then converts the user's input
 * back to UTC via the same `zonedTimeToUtc` helper the drag-and-drop path
 * uses — keeping all shift mutations canonically Europe/Berlin.
 */
function RescheduleDialog({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event: ShiftEvent;
}) {
  const t = useTranslations("schedule");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>("");

  function initialState() {
    const s = getZonedParts(new Date(event.starts_at), APP_TZ);
    const e = getZonedParts(new Date(event.ends_at), APP_TZ);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${s.year}-${pad(s.month)}-${pad(s.day)}`,
      startTime: `${pad(s.hour)}:${pad(s.minute)}`,
      endTime: `${pad(e.hour)}:${pad(e.minute)}`,
    };
  }
  const [form, setForm] = useState(initialState);

  // Re-seed when the parent swaps the underlying shift.
  useEffect(() => {
    setForm(initialState());
    // initialState reads from `event`, so re-run whenever it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.starts_at, event.ends_at]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.endTime <= form.startTime) {
      setError(t("dialog.endAfterStart"));
      return;
    }
    const [y, m, d] = form.date.split("-").map(Number);
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    if (!y || !m || !d) {
      setError(t("dialog.endAfterStart"));
      return;
    }
    const startsUtc = zonedTimeToUtc(y, m, d, sh ?? 0, sm ?? 0, 0, APP_TZ);
    const endsUtc = zonedTimeToUtc(y, m, d, eh ?? 0, em ?? 0, 0, APP_TZ);
    // Keep the existing employee assignment — only the team's *first*
    // member is the canonical employee_id for the shift row. If the
    // shift is unstaffed (event.team is empty) we send null.
    const employeeId = event.team[0]?.id ?? null;

    start(async () => {
      const r = await updateShiftAction({
        id: event.id,
        property_id: event.property_id,
        employee_id: employeeId,
        starts_at: startsUtc.toISOString(),
        ends_at: endsUtc.toISOString(),
        notes: event.notes ?? "",
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error || t("toast.rescheduleError"));
        return;
      }
      toast.success(t("toast.rescheduled"));
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("actions.rescheduleTitle")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <h2 className="text-[18px] font-bold text-secondary-500">
            {t("actions.rescheduleTitle")}
          </h2>
          <button
            type="button"
            aria-label={t("dialog.cancel")}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <form onSubmit={submit} className="flex flex-col overflow-y-auto" noValidate>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 md:col-span-2">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("dialog.date")}
              </span>
              <input
                type="date"
                required
                className="input"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("dialog.startTime")}
              </span>
              <input
                type="time"
                required
                className="input"
                value={form.startTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startTime: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("dialog.endTime")}
              </span>
              <input
                type="time"
                required
                className="input"
                value={form.endTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endTime: e.target.value }))
                }
              />
            </label>
            {error && (
              <span className="text-[12px] text-error-700 md:col-span-2">
                {error}
              </span>
            )}
          </div>
          <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
            <button
              type="button"
              className="btn btn--ghost border border-neutral-200"
              onClick={onClose}
            >
              {t("dialog.cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? t("dialog.saving") : t("dialog.save")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/**
 * Export menu — wires the previously-orphaned Export button to the existing
 * `/api/schedule/pdf` and `/api/schedule/ical` endpoints.
 *
 *  • PDF download triggers a new tab (browser handles the streamed response).
 *  • iCal subscription mints (or reuses) an opaque token via
 *    `ensureCalendarTokenAction`, then copies the feed URL to the clipboard
 *    so the user can paste it into Apple/Google/Outlook calendar.
 */
function ExportMenu({ anchorDate }: { anchorDate: string | null }) {
  const t = useTranslations("schedule");
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function downloadPdf() {
    setOpen(false);
    const url = anchorDate
      ? `/api/schedule/pdf?date=${anchorDate}`
      : "/api/schedule/pdf";
    // Use a hidden anchor instead of window.open() so popup blockers don't
    // eat the download.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function copyIcalLink() {
    setOpen(false);
    start(async () => {
      const r = await ensureCalendarTokenAction();
      if (!r.ok) {
        toast.error(t("actions.exportFailed"));
        return;
      }
      const url = `${window.location.origin}/api/schedule/ical?token=${encodeURIComponent(r.data.token)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t("actions.exportIcalCopied"));
      } catch {
        // Clipboard blocked (Safari private mode, insecure context, etc.).
        // Fall back to a prompt so the user can copy manually.
        window.prompt(t("actions.exportIcal"), url);
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn--tertiary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
        </svg>
        {t("actions.export")}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-md border border-neutral-100 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={downloadPdf}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-700 transition hover:bg-neutral-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-neutral-500">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            {t("actions.exportPdf")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={copyIcalLink}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-700 transition hover:bg-neutral-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-neutral-500">
              <rect x={3} y={5} width={18} height={16} rx={2} />
              <path d="M3 9h18M8 3v4M16 3v4" />
            </svg>
            {t("actions.exportIcal")}
          </button>
        </div>
      )}
    </div>
  );
}
