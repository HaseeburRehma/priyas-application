"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { ClientCustomerType } from "@/lib/api/clients.types";

type Props = {
  q: string;
  onQ: (v: string) => void;
  type: ClientCustomerType | "all";
  onType: (v: ClientCustomerType | "all") => void;
  view: "list" | "grid";
  onView: (v: "list" | "grid") => void;
};

export function ClientsToolbar({ q, onQ, type, onType, view, onView }: Props) {
  const t = useTranslations("clients.toolbar");

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-4">
      {/* Search */}
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

      <FilterChip label={t("filterStatus")} active count={2} />
      <TypeChip type={type} onChange={onType} />
      <FilterChip label={t("filterContract")} />
      <FilterChip
        label={t("filterMore")}
        leadingIcon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
        }
      />

      <div className="flex-1" />

      <div className="inline-flex rounded-md border border-neutral-100 bg-neutral-50 p-1 text-[12px]">
        <SegBtn active={view === "list"} onClick={() => onView("list")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <line x1={3} y1={6} x2={21} y2={6} />
            <line x1={3} y1={12} x2={21} y2={12} />
            <line x1={3} y1={18} x2={21} y2={18} />
          </svg>
          {t("viewList")}
        </SegBtn>
        <SegBtn active={view === "grid"} onClick={() => onView("grid")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <rect x={3} y={3} width={7} height={7} />
            <rect x={14} y={3} width={7} height={7} />
            <rect x={3} y={14} width={7} height={7} />
            <rect x={14} y={14} width={7} height={7} />
          </svg>
          {t("viewGrid")}
        </SegBtn>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active = false,
  count,
  leadingIcon,
  onClick,
}: {
  label: string;
  active?: boolean;
  count?: number;
  leadingIcon?: React.ReactNode;
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
      {leadingIcon && <span className="[&_svg]:h-3 [&_svg]:w-3">{leadingIcon}</span>}
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

function TypeChip({
  type,
  onChange,
}: {
  type: ClientCustomerType | "all";
  onChange: (v: ClientCustomerType | "all") => void;
}) {
  const t = useTranslations("clients.toolbar");
  const labelOf = (v: ClientCustomerType | "all") =>
    v === "all"
      ? t("typeAll")
      : v === "residential"
        ? t("typePrivate")
        : v === "commercial"
          ? t("typeCompany")
          : t("typeAlltagshilfe");
  const next = (curr: ClientCustomerType | "all"): ClientCustomerType | "all" => {
    if (curr === "all") return "residential";
    if (curr === "residential") return "commercial";
    if (curr === "commercial") return "alltagshilfe";
    return "all";
  };
  return (
    <FilterChip
      label={labelOf(type)}
      active={type !== "all"}
      onClick={() => onChange(next(type))}
    />
  );
}

function SegBtn({
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
