"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { PropertyKind, PropertyStatus } from "@/lib/api/properties.types";

type Props = {
  q: string;
  onQ: (v: string) => void;
  kind: PropertyKind | "all";
  onKind: (v: PropertyKind | "all") => void;
  status: PropertyStatus | "all";
  onStatus: (v: PropertyStatus | "all") => void;
  view: "list" | "grid";
  onView: (v: "list" | "grid") => void;
};

export function PropertiesToolbar({
  q,
  onQ,
  kind,
  onKind,
  status,
  onStatus,
  view,
  onView,
}: Props) {
  const t = useTranslations("properties.toolbar");
  const tKind = useTranslations("properties.kind");
  const tStatus = useTranslations("properties.status");

  const nextKind = (k: PropertyKind | "all"): PropertyKind | "all" => {
    const order: (PropertyKind | "all")[] = [
      "all",
      "office",
      "retail",
      "residential",
      "medical",
      "industrial",
      "other",
    ];
    return order[(order.indexOf(k) + 1) % order.length] ?? "all";
  };
  const nextStatus = (s: PropertyStatus | "all"): PropertyStatus | "all" => {
    const order: (PropertyStatus | "all")[] = [
      "all",
      "active",
      "onboarding",
      "attention",
      "paused",
    ];
    return order[(order.indexOf(s) + 1) % order.length] ?? "all";
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-4">
      <div className="flex min-w-[240px] flex-1 items-center gap-2.5 rounded-md border border-neutral-100 bg-neutral-50 px-3.5 py-2">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-neutral-400"
        >
          <circle cx={11} cy={11} r={7} />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-800 outline-none placeholder:text-neutral-400"
        />
      </div>

      <Chip
        label={kind === "all" ? t("filterType") : tKind(kind)}
        active={kind !== "all"}
        count={kind !== "all" ? 1 : undefined}
        onClick={() => onKind(nextKind(kind))}
      />
      <Chip label={t("filterClient")} />
      <Chip
        label={status === "all" ? t("filterStatus") : tStatus(status)}
        active={status !== "all"}
        onClick={() => onStatus(nextStatus(status))}
      />
      <Chip label={t("filterTeam")} />
      <Chip label={t("filterMore")} />

      <div className="flex-1" />

      <div className="inline-flex rounded-md border border-neutral-100 bg-neutral-50 p-1 text-[12px]">
        <Seg active={view === "list"} onClick={() => onView("list")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <line x1={3} y1={6} x2={21} y2={6} />
            <line x1={3} y1={12} x2={21} y2={12} />
            <line x1={3} y1={18} x2={21} y2={18} />
          </svg>
          {t("viewList")}
        </Seg>
        <Seg active={view === "grid"} onClick={() => onView("grid")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <rect x={3} y={3} width={7} height={7} />
            <rect x={14} y={3} width={7} height={7} />
            <rect x={3} y={14} width={7} height={7} />
            <rect x={14} y={14} width={7} height={7} />
          </svg>
          {t("viewGrid")}
        </Seg>
      </div>
    </div>
  );
}

function Chip({
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
