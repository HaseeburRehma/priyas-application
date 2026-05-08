"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { updateShiftAction } from "@/app/actions/shifts";
import { ensureCalendarTokenAction } from "@/app/actions/calendar-token";
import { PlanShiftDialog } from "./PlanShiftDialog";

const HOURS = Array.from({ length: 13 }, (_, i) => 6 + i); // 06–18
const dayNames = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
const dayNamesEN = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

type Props = { week: ScheduleWeek };

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

export function SchedulePage({ week }: Props) {
  const t = useTranslations("schedule");
  const locale = useLocale() as keyof typeof localeMap;
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
   * server-side and feeds it into loadScheduleWeek(anchor); pushing a new
   * URL is therefore the only thing we need to do here. Passing `null`
   * navigates back to "today" (no query string) so the page resolves the
   * anchor against `new Date()` again.
   */
  function navigateToDate(date: Date | null) {
    if (date === null) {
      router.push("/schedule");
      return;
    }
    const iso = format(date, "yyyy-MM-dd");
    router.push(`/schedule?date=${iso}`);
  }

  // Anchor for prev/next/today buttons. Falls back to today if the server
  // somehow returned an empty week (shouldn't happen, but defensive).
  const weekAnchor = week.days[0]
    ? new Date(week.days[0])
    : new Date();

  /**
   * Drag-and-drop handler — invoked when a shift block is dropped on a
   * different day/hour cell. Moves the shift while preserving its duration,
   * then refreshes via Next.js so the calendar reflects the new position.
   */
  function moveShift(shiftId: string, isoDay: string, hour: number) {
    const ev = week.events.find((e) => e.id === shiftId);
    if (!ev) return;
    const oldStart = new Date(ev.starts_at);
    const oldEnd = new Date(ev.ends_at);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const newStart = new Date(isoDay);
    newStart.setHours(hour, oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    if (
      newStart.toISOString() === ev.starts_at &&
      newEnd.toISOString() === ev.ends_at
    ) {
      return; // no-op
    }
    dndStart(async () => {
      const r = await updateShiftAction({
        id: ev.id,
        property_id: ev.property_id,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
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

      {/* Toolbar — view tabs + week label + service + filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-100 bg-white p-3">
        <button
          type="button"
          aria-label={t("prevWeek")}
          onClick={() => navigateToDate(addDays(weekAnchor, -7))}
          className="btn btn--ghost border border-neutral-200 bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="text-[13px] font-semibold text-neutral-800">
          {week.weekLabel}
        </div>
        <button
          type="button"
          aria-label={t("nextWeek")}
          onClick={() => navigateToDate(addDays(weekAnchor, 7))}
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

        {/* View tabs */}
        <div className="ml-3 inline-flex rounded-md border border-neutral-100 bg-neutral-50 p-1 text-[12px]">
          <Tab>{t("tabs.day")}</Tab>
          <Tab active>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x={3} y={5} width={18} height={16} rx={2} />
              <path d="M3 9h18" />
            </svg>
            {t("tabs.week")}
          </Tab>
          <Tab>{t("tabs.month")}</Tab>
          <Tab>{t("tabs.list")}</Tab>
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

      {/* Body: sidebar | calendar | detail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr_360px]">
        <Sidebar
          anchor={new Date(week.days[0]!)}
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

        <CalendarGrid
          week={week}
          events={visibleEvents}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onMove={moveShift}
          locale={locale}
        />

        <DetailPanel event={selected ?? null} t={t} />
      </div>
    </>
  );

  function Tab({ active, children }: { active?: boolean; children: React.ReactNode }) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium",
          active ? "bg-white text-secondary-500 shadow-xs" : "text-neutral-600",
        )}
      >
        {children}
      </span>
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
  const [today, setToday] = useState<string>("");
  useEffect(() => {
    setToday(new Date().toDateString());
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
          const isToday = d.toDateString() === today;
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
          const start = new Date(e.starts_at);
          return (
            start.toISOString().slice(0, 10) === iso && start.getHours() === hour
          );
        });
        const isWeekend = i >= 5;
        const isTodayCol = new Date(iso).toDateString() === isToday;
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
  const start = format(new Date(event.starts_at), "HH:mm");
  const end = format(new Date(event.ends_at), "HH:mm");
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

function DetailPanel({
  event,
  t,
}: {
  event: ShiftEvent | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!event) {
    return (
      <aside className="rounded-lg border border-neutral-100 bg-white p-6 text-center text-[13px] text-neutral-500">
        {t("empty")}
      </aside>
    );
  }
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const durationH = (end.getTime() - start.getTime()) / 3_600_000;
  const lane = laneColor[event.service_lane];

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
          {format(start, "EEEE, d. MMM")} · {format(start, "HH:mm")} – {format(end, "HH:mm")}
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
