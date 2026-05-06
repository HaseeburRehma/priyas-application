"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import {
  deleteTrainingModuleAction,
  setTrainingAssignmentsAction,
  updateTrainingProgressAction,
  upsertTrainingModuleAction,
} from "@/app/actions/training";
import type {
  TrainingAssignment,
  TrainingHubData,
  TrainingModule,
} from "@/lib/api/training";

type Props = TrainingHubData;

export function TrainingHub({
  canManage,
  modules,
  progress,
  assignmentsByModule,
  employees,
}: Props) {
  const t = useTranslations("training");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editor, setEditor] = useState<TrainingModule | "new" | null>(null);
  const [assignFor, setAssignFor] = useState<TrainingModule | null>(null);
  const [active, setActive] = useState<TrainingModule | null>(modules[0] ?? null);

  const stats = useMemo(() => {
    const total = modules.length;
    const completed = modules.filter(
      (m) => progress[m.id]?.completed_at,
    ).length;
    const mandatoryTotal = modules.filter((m) => m.is_mandatory).length;
    const mandatoryDone = modules.filter(
      (m) => m.is_mandatory && progress[m.id]?.completed_at,
    ).length;
    return { total, completed, mandatoryTotal, mandatoryDone };
  }, [modules, progress]);

  function setProgress(moduleId: string, state: "start" | "complete" | "reset") {
    start(async () => {
      const r = await updateTrainingProgressAction({
        module_id: moduleId,
        state,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        state === "complete"
          ? t("toastCompleted")
          : state === "reset"
            ? t("toastReset")
            : t("toastStarted"),
      );
      router.refresh();
    });
  }

  function deleteModule(id: string) {
    start(async () => {
      const r = await deleteTrainingModuleAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("toastDeleted"));
      router.refresh();
    });
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditor("new")}
            className="btn btn--primary"
          >
            {t("newModule")}
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label={t("statTotal")} value={String(stats.total)} />
        <Stat
          label={t("statCompleted")}
          value={`${stats.completed} / ${stats.total}`}
          tone="success"
        />
        <Stat
          label={t("statMandatory")}
          value={`${stats.mandatoryDone} / ${stats.mandatoryTotal}`}
          tone="warning"
        />
        <Stat
          label={t("statProgress")}
          value={
            stats.total === 0
              ? "—"
              : `${Math.round((stats.completed / stats.total) * 100)}%`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* List */}
        <aside className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-white p-2">
          {modules.length === 0 && (
            <div className="rounded-md border border-dashed border-neutral-200 p-8 text-center text-[13px] text-neutral-500">
              {t("empty")}
            </div>
          )}
          {modules.map((m) => {
            const isActive = active?.id === m.id;
            const p = progress[m.id];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(m)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-md p-3 text-left transition",
                  isActive
                    ? "bg-primary-50 ring-1 ring-primary-300"
                    : "hover:bg-neutral-50",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold text-neutral-800">
                    {m.title}
                  </span>
                  {m.is_mandatory && (
                    <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning-700">
                      {t("mandatoryTag")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  {p?.completed_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 font-semibold text-success-700">
                      ✓ {t("statusCompleted")}
                    </span>
                  ) : p?.started_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2 py-0.5 font-semibold text-secondary-700">
                      {t("statusInProgress")}
                    </span>
                  ) : (
                    <span className="text-neutral-500">
                      {t("statusNotStarted")}
                    </span>
                  )}
                  <span className="font-mono text-neutral-400">
                    {m.locale.toUpperCase()}
                  </span>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Detail */}
        <section className="rounded-lg border border-neutral-100 bg-white p-5">
          {active ? (
            <ModuleView
              module={active}
              progress={progress[active.id]}
              canManage={canManage}
              pending={pending}
              assignmentCount={
                Object.keys(assignmentsByModule[active.id] ?? {}).length
              }
              onStart={() => setProgress(active.id, "start")}
              onComplete={() => setProgress(active.id, "complete")}
              onReset={() => setProgress(active.id, "reset")}
              onEdit={() => setEditor(active)}
              onAssign={() => setAssignFor(active)}
              onDelete={() => deleteModule(active.id)}
            />
          ) : (
            <div className="grid place-items-center py-16 text-[13px] text-neutral-500">
              {t("selectModule")}
            </div>
          )}
        </section>
      </div>

      {editor && (
        <ModuleEditor
          initial={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}

      {assignFor && (
        <AssignmentEditor
          module={assignFor}
          employees={employees}
          existing={assignmentsByModule[assignFor.id] ?? {}}
          onClose={() => setAssignFor(null)}
          onSaved={() => {
            setAssignFor(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-[20px] font-bold",
          tone === "success" && "text-success-700",
          tone === "warning" && "text-warning-700",
          !tone && "text-secondary-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ModuleView({
  module: m,
  progress,
  canManage,
  pending,
  assignmentCount,
  onStart,
  onComplete,
  onReset,
  onEdit,
  onAssign,
  onDelete,
}: {
  module: TrainingModule;
  progress?: { started_at: string | null; completed_at: string | null };
  canManage: boolean;
  pending: boolean;
  assignmentCount: number;
  onStart: () => void;
  onComplete: () => void;
  onReset: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("training");
  const completed = !!progress?.completed_at;
  const started = !!progress?.started_at;

  // Try YouTube/Vimeo embed; fallback to direct video tag for direct URLs.
  const embed = toEmbedUrl(m.video_url);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-secondary-500">
            {m.title}
          </h2>
          {m.is_mandatory && (
            <span className="mt-1 inline-block rounded-full bg-warning-50 px-2 py-0.5 text-[10px] font-bold uppercase text-warning-700">
              {t("mandatoryTag")}
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAssign}
              className="btn btn--ghost border border-neutral-200 bg-white"
            >
              {assignmentCount > 0
                ? t("assignedTo", { n: assignmentCount })
                : t("assignBtn")}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="btn btn--ghost border border-neutral-200 bg-white"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("confirmDelete"))) onDelete();
              }}
              className="btn btn--ghost border border-error-300 text-error-700 hover:bg-error-50"
            >
              {t("delete")}
            </button>
          </div>
        )}
      </div>

      {m.video_url ? (
        embed ? (
          <div className="aspect-video overflow-hidden rounded-md border border-neutral-100 bg-black">
            <iframe
              src={embed}
              title={m.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : (
          <video
            controls
            preload="metadata"
            className="aspect-video w-full rounded-md border border-neutral-100 bg-black"
            onPlay={() => {
              if (!started && !completed) onStart();
            }}
          >
            <source src={m.video_url} />
          </video>
        )
      ) : (
        <div className="grid aspect-video place-items-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 text-[13px] text-neutral-500">
          {t("noVideo")}
        </div>
      )}

      {m.description && (
        <p className="text-[13px] leading-[1.6] text-neutral-700">
          {m.description}
        </p>
      )}

      <div className="rounded-md border border-neutral-100 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] text-neutral-600">
            {completed ? (
              <>
                <span className="font-semibold text-success-700">
                  ✓ {t("completedOn")}
                </span>{" "}
                {format(new Date(progress!.completed_at!), "yyyy-MM-dd HH:mm")}
              </>
            ) : started ? (
              <>
                {t("startedOn")}{" "}
                {format(new Date(progress!.started_at!), "yyyy-MM-dd HH:mm")}
              </>
            ) : (
              t("notStartedYet")
            )}
          </div>
          <div className="flex gap-2">
            {!started && !completed && (
              <button
                type="button"
                onClick={onStart}
                disabled={pending}
                className="btn btn--tertiary"
              >
                {t("markStarted")}
              </button>
            )}
            {!completed && (
              <button
                type="button"
                onClick={onComplete}
                disabled={pending}
                className="btn btn--primary"
              >
                {t("markCompleted")}
              </button>
            )}
            {(started || completed) && (
              <button
                type="button"
                onClick={onReset}
                disabled={pending}
                className="btn btn--ghost border border-neutral-200 bg-white"
              >
                {t("reset")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: TrainingModule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("training.editor");
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    video_url: initial?.video_url ?? "",
    is_mandatory: initial?.is_mandatory ?? false,
    position: initial?.position ?? 0,
    locale: initial?.locale ?? "de",
  });

  function save() {
    start(async () => {
      const r = await upsertTrainingModuleAction({
        id: initial?.id,
        title: form.title.trim(),
        description: form.description,
        video_url: form.video_url || "",
        is_mandatory: form.is_mandatory,
        position: form.position,
        locale: form.locale as "de" | "en" | "ta",
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("saved"));
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-[560px] rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-neutral-100 p-5">
          <h3 className="text-[16px] font-semibold text-neutral-800">
            {initial ? t("editTitle") : t("newTitle")}
          </h3>
        </header>
        <div className="flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
              {t("title")}
            </span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
              {t("videoUrl")}
            </span>
            <input
              className="input"
              type="url"
              placeholder="https://…"
              value={form.video_url}
              onChange={(e) =>
                setForm({ ...form, video_url: e.target.value })
              }
            />
            <span className="text-[11px] text-neutral-500">
              {t("videoUrlHint")}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
              {t("description")}
            </span>
            <textarea
              rows={4}
              className="input min-h-[96px]"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("locale")}
              </span>
              <select
                className="input"
                value={form.locale}
                onChange={(e) =>
                  setForm({ ...form, locale: e.target.value })
                }
              >
                <option value="de">DE</option>
                <option value="en">EN</option>
                <option value="ta">TA</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("position")}
              </span>
              <input
                type="number"
                className="input"
                value={form.position}
                onChange={(e) =>
                  setForm({
                    ...form,
                    position: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={form.is_mandatory}
                onChange={(e) =>
                  setForm({ ...form, is_mandatory: e.target.checked })
                }
                className="h-4 w-4"
              />
              <span className="text-[13px] text-neutral-700">
                {t("mandatory")}
              </span>
            </label>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn btn--ghost border border-neutral-200"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || form.title.trim().length < 2}
            className="btn btn--primary"
          >
            {pending ? "…" : t("save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function AssignmentEditor({
  module: m,
  employees,
  existing,
  onClose,
  onSaved,
}: {
  module: TrainingModule;
  employees: Array<{ id: string; full_name: string }>;
  existing: Record<string, TrainingAssignment>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("training.assign");
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(Object.keys(existing)),
  );
  const [dueDate, setDueDate] = useState<string>(() => {
    const first = Object.values(existing)[0]?.due_date;
    return first ?? "";
  });
  const [filter, setFilter] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(employees.map((e) => e.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function save() {
    start(async () => {
      const r = await setTrainingAssignmentsAction(
        m.id,
        Array.from(selected),
        dueDate || null,
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("saved"));
      onSaved();
    });
  }

  const filteredEmployees = filter.trim()
    ? employees.filter((e) =>
        e.full_name.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : employees;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-[560px] rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-neutral-100 p-5">
          <h3 className="text-[16px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <p className="mt-1 text-[12px] text-neutral-500">
            {t("subtitle", { module: m.title })}
          </p>
        </header>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1"
              placeholder={t("filterPlaceholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              onClick={selectAll}
              className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
            >
              {t("selectAll")}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
            >
              {t("clear")}
            </button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
              {t("dueDate")}
            </span>
            <input
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <div className="max-h-[280px] overflow-y-auto rounded-md border border-neutral-100">
            {filteredEmployees.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-neutral-500">
                {t("empty")}
              </div>
            ) : (
              <ul>
                {filteredEmployees.map((e) => {
                  const checked = selected.has(e.id);
                  return (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-center gap-3 border-b border-neutral-50 px-3 py-2 last:border-b-0 hover:bg-neutral-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(e.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-[13px] text-neutral-800">
                          {e.full_name}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            {t("visibility", { n: selected.size })}
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn btn--ghost border border-neutral-200"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn btn--primary"
          >
            {pending ? "…" : t("save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Convert a YouTube or Vimeo URL into an embeddable iframe URL.
 * Returns null for direct video files (handled with <video>).
 */
function toEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id =
        u.hostname.includes("youtu.be")
          ? u.pathname.slice(1)
          : u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}
