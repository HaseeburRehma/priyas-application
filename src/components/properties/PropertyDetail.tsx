import Link from "next/link";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { PropertyDetail as Detail } from "@/lib/api/properties.types";
import { PropertyDetailActions } from "./PropertyDetailActions";

const teamTone = ["bg-primary-500", "bg-secondary-500", "bg-accent-600", "bg-warning-500"];

export function PropertyDetail({
  detail,
  canUpdate,
  canDelete,
}: {
  detail: Detail;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("properties.detail");

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.properties} className="hover:text-neutral-700">
          {t("breadcrumbProperties")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="truncate text-neutral-700">{detail.name}</span>
      </nav>

      {/* Hero */}
      <section className="mb-6 rounded-lg border border-neutral-100 bg-white p-5">
        <div className="flex flex-wrap items-start gap-5">
          <span className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-md bg-secondary-50 text-secondary-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <rect x={3} y={7} width={18} height={14} rx={1} />
              <path d="M8 21V11M16 21V11M3 11h18M7 4l5-2 5 2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-bold text-secondary-500">
                {detail.name}
              </h1>
              <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-white">
                {t("newBadge")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-neutral-400">
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                  <circle cx={12} cy={10} r={3} />
                </svg>
                {detail.address_line1}
                {detail.address_line2 ? `, ${detail.address_line2}` : ""} ·{" "}
                {detail.postal_code} {detail.city}
              </span>
              <Link
                href={routes.client(detail.client_id)}
                className="inline-flex items-center gap-1.5 text-primary-700 hover:underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx={9} cy={7} r={4} />
                </svg>
                {detail.client_name}
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat
                label={t("statFloor")}
                value={detail.size_sqm ? `${detail.size_sqm.toLocaleString("de-DE")} m²` : "—"}
              />
              <Stat label={t("statRooms")} value={detail.rooms ?? "—"} />
              <Stat
                label={t("statFrequency")}
                value={t("perWeek", { count: detail.weekly_frequency })}
                accent="primary"
              />
              <Stat label={t("statTeam")} value={detail.team_size} />
              <Stat
                label={t("statContractEnd")}
                value={
                  detail.contract_end
                    ? format(new Date(detail.contract_end), "MMM yyyy")
                    : "—"
                }
                accent={detail.contract_end ? "warn" : undefined}
              />
            </div>
          </div>

          <PropertyDetailActions
            id={detail.id}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        </div>
      </section>

      {/* Tabs */}
      <section className="mb-5 rounded-lg border border-neutral-100 bg-white">
        <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-neutral-100 px-2 py-1.5 text-[13px]">
          <Tab active>{t("tabOverview")}</Tab>
          <Tab count={detail.area_count}>{t("tabAreas")}</Tab>
          <Tab>{t("tabSchedule")}</Tab>
          <Tab count={detail.assignment_count}>{t("tabAssignments")}</Tab>
          <Tab count={detail.document_count}>{t("tabDocuments")}</Tab>
          <Tab>{t("tabHistory")}</Tab>
        </div>
      </section>

      {/* Body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <AreasCard areas={detail.areas} />
          <ServiceScopeCard canUpdate={canUpdate} />
          <TeamCard team={detail.team} />
        </div>
        <KeyInfoCard detail={detail} />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "primary" | "warn";
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "text-[20px] font-bold leading-tight tracking-[-0.01em]",
          accent === "primary"
            ? "text-primary-700"
            : accent === "warn"
              ? "text-warning-700"
              : "text-secondary-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Tab({
  active,
  count,
  children,
}: {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 rounded-md px-3 py-2",
        active ? "text-primary-700" : "text-neutral-600",
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
          {count}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-primary-500" />
      )}
    </span>
  );
}

function AreasCard({ areas }: { areas: Detail["areas"] }) {
  const t = useTranslations("properties.detail");
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("areasTitle")}
        </h3>
        <Link href="#" className="text-[12px] font-medium text-primary-600 hover:text-primary-700">
          {t("areasViewAll", { count: areas.length })}
        </Link>
      </header>
      <div className="px-5 py-2">
        {areas.map((a, idx) => (
          <div
            key={a.id}
            className={cn(
              "flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0",
            )}
          >
            <span
              className={cn(
                "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md",
                idx % 2 === 0 ? "bg-primary-50 text-primary-600" : "bg-secondary-50 text-secondary-600",
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <rect x={3} y={3} width={18} height={18} rx={2} />
                <path d="M3 12h18M12 3v18" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-neutral-800">
                Area {String(idx + 1).padStart(2, "0")} · {a.name}
              </div>
              <div className="truncate text-[11px] text-neutral-500">
                {a.floor}
                {a.zone ? ` · ${a.zone}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-semibold text-secondary-500">
                {a.size_sqm ? `${a.size_sqm} m²` : "—"}
              </div>
              <div className="text-[11px] text-primary-700">{a.frequency ?? "—"}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ServiceScopeCard({ canUpdate }: { canUpdate: boolean }) {
  const t = useTranslations("properties.detail");
  const items = [
    { title: t("scopeGeneral"), sub: t("scopeGeneralSub") },
    { title: t("scopeCarpet"), sub: t("scopeCarpetSub") },
    { title: t("scopeWindows"), sub: t("scopeWindowsSub") },
    { title: t("scopeWaste"), sub: t("scopeWasteSub") },
  ];
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("scopeTitle")}
        </h3>
        {canUpdate && (
          <Link href="#" className="text-[12px] font-medium text-primary-600">
            {t("scopeEdit")}
          </Link>
        )}
      </header>
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        {items.map((it) => (
          <div
            key={it.title}
            className="flex items-center gap-3 rounded-md border border-neutral-100 bg-tertiary-200 px-3 py-2.5"
          >
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-white text-primary-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-neutral-800">
                {it.title}
              </div>
              <div className="truncate text-[11px] text-neutral-500">
                {it.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamCard({ team }: { team: Detail["team"] }) {
  const t = useTranslations("properties.detail");
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("teamTitle")}
        </h3>
      </header>
      <div className="px-5 py-2">
        {team.length === 0 && (
          <div className="py-6 text-center text-[13px] text-neutral-500">—</div>
        )}
        {team.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0"
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white",
                teamTone[i % 4],
              )}
            >
              {m.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-neutral-800">
                {m.name}
              </div>
              <div className="text-[11px] text-neutral-500">
                {i === 0 ? t("teamRoleLead") : t("teamRoleField")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KeyInfoCard({ detail }: { detail: Detail }) {
  const t = useTranslations("properties.detail");
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("infoTitle")}
        </h3>
      </header>
      <dl className="divide-y divide-neutral-100 px-5">
        <Row label={t("propertyId")} value={`PRP-${detail.id.slice(0, 8).toUpperCase()}`} mono />
        <Row label={t("address")} value={`${detail.address_line1}, ${detail.postal_code} ${detail.city}`} />
        <Row
          label={t("client")}
          value={
            <Link
              href={routes.client(detail.client_id)}
              className="text-primary-700 hover:underline"
            >
              {detail.client_name}
            </Link>
          }
        />
        <Row label={t("type")} value={detail.kind} />
        <Row label={t("size")} value={detail.size_sqm ? `${detail.size_sqm} m²` : "—"} />
        <Row label={t("rooms")} value={detail.rooms ?? "—"} />
        <Row label={t("weeklyShifts")} value={detail.weekly_frequency} />
        {detail.floor && <Row label={t("floor")} value={detail.floor} />}
        {detail.building_section && (
          <Row label={t("buildingSection")} value={detail.building_section} />
        )}
        {detail.access_code && (
          <Row label={t("accessCode")} value={detail.access_code} mono />
        )}
        <Row
          label={t("createdAt")}
          value={format(new Date(detail.created_at), "yyyy-MM-dd")}
          mono
        />
      </dl>
      {(detail.allergies ||
        detail.restricted_areas ||
        detail.safety_regulations) && (
        <div className="border-t border-neutral-100 p-5">
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-warning-700">
            {t("safetySectionTitle")}
          </div>
          <div className="space-y-3">
            {detail.allergies && (
              <SafetyBlock title={t("allergies")} body={detail.allergies} />
            )}
            {detail.restricted_areas && (
              <SafetyBlock
                title={t("restrictedAreas")}
                body={detail.restricted_areas}
              />
            )}
            {detail.safety_regulations && (
              <SafetyBlock
                title={t("safetyRegulations")}
                body={detail.safety_regulations}
              />
            )}
          </div>
        </div>
      )}
      {detail.notes && (
        <div className="border-t border-neutral-100 p-5">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-warning-700">
            {t("notesTitle")}
          </div>
          <p className="text-[13px] leading-[1.5] text-neutral-700">{detail.notes}</p>
        </div>
      )}
    </section>
  );
}

function SafetyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600">
        {title}
      </div>
      <p className="whitespace-pre-line text-[13px] leading-[1.55] text-neutral-700">
        {body}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3 py-3 text-[12px]">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={cn(
          "text-right",
          mono ? "font-mono text-neutral-700" : "text-neutral-800",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
