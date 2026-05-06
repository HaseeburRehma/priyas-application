"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format, addDays, startOfMonth, endOfMonth, getDay } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { ScheduleWeek, ServiceLane, ShiftEvent } from "@/lib/api/schedule.types";
import { updateShiftAction } from "@/app/actions/shifts";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();
  const [, dndStart] = useTransition();

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
      week.events.filter(
        (e) =>
          (serviceFilter === "all" || e.service_lane === serviceFilter) &&
          statusFilter.has(e.status),
      ),
    [week.events, serviceFilter, statusFilter],
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
          <button className="btn btn--tertiary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
            </svg>
            {t("actions.export")}
          </button>
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
        <button className="btn btn--ghost border border-neutral-200 bg-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="text-[13px] font-semibold text-neutral-800">
          {week.weekLabel}
        </div>
        <button className="btn btn--ghost border border-neutral-200 bg-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <button className="btn btn--tertiary text-[12px]">{t("today")}</button>

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
          statusFilter={statusFilter}
          onToggleStatus={(s) =>
            setStatusFilter((prev) => {
              const n = new Set(prev);
              if (n.has(s)) n.delete(s);
              else n.add(s);
              return n;
            })
          }
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
  statusFilter,
  onToggleStatus,
}: {
  anchor: Date;
  statusFilter: Set<ShiftEvent["status"]>;
  onToggleStatus: (s: ShiftEvent["status"]) => void;
}) {
  const t = useTranslations("schedule.sidebar");
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const offset = (getDay(monthStart) + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const teams = [
    { label: "Team 01 · Kern", count: 12, color: "secondary-500", on: true },
    { label: "Team 02 · Springer", count: 8, color: "primary-500", on: true },
    { label: "Team 03 · Specialists", count: 5, color: "warning-500", on: true },
    { label: "Team 04 · Night", count: 3, color: "error-500", on: false },
    { label: t("subcontractor"), count: 4, color: "neutral-400", on: false },
  ];

  return (
    <aside className="flex flex-col gap-4">
      {/* Mini calendar */}
      <section className="rounded-lg border border-neutral-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between text-[12px] font-semibold text-neutral-700">
          {format(anchor, "MMMM yyyy")}
          <div className="flex gap-1">
            <button className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-neutral-50">
              ‹
            </button>
            <button className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-neutral-50">
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

      {/* Team filters */}
      <section className="rounded-lg border border-neutral-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-neutral-800">{t("team")}</h4>
          <span className="text-[11px] text-primary-600">{t("teamAll")}</span>
        </header>
        <div className="flex flex-col gap-2">
          {teams.map((tm) => (
            <label
              key={tm.label}
              className="flex cursor-pointer items-center gap-2.5 text-[12px]"
            >
              <input
                type="checkbox"
                defaultChecked={tm.on}
                className="h-3.5 w-3.5 rounded border-neutral-300 accent-primary-500"
              />
              <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", `bg-${tm.color}`)} />
              <span className="flex-1 truncate text-neutral-700">{tm.label}</span>
              <span className="text-[11px] text-neutral-400">{tm.count}</span>
            </label>
          ))}
        </div>
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
            count={18}
            active={statusFilter.has("completed")}
            onToggle={() => onToggleStatus("completed")}
          />
          <StatusRow
            color="bg-secondary-500"
            label={t("scheduled")}
            count={15}
            active={statusFilter.has("scheduled")}
            onToggle={() => onToggleStatus("scheduled")}
          />
          <StatusRow
            color="bg-warning-500"
            label={t("running")}
            count={3}
            active={statusFilter.has("in_progress")}
            onToggle={() => onToggleStatus("in_progress")}
          />
          <StatusRow
            color="bg-error-500"
            label={t("missedOverdue")}
            count={1}
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
          aria-label="close"
          className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-50"
        >
          ✕
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
