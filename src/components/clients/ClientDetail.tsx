import Link from "next/link";
import { useTranslations } from "next-intl";
import { differenceInMonths } from "date-fns";
import type { ClientDetail as Detail } from "@/lib/api/clients.types";
import { useFormat } from "@/lib/utils/i18n-format";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { ClientDetailActions } from "./ClientDetailActions";
import { PayerChip } from "./PayerChip";

type Props = {
  detail: Detail;
  canUpdate: boolean;
  canArchive: boolean;
};

/**
 * Pixel-faithful rendition of 04-client-detail.html. Server-rendered;
 * the action menu lifts off into a small client component.
 */
export function ClientDetail({ detail, canUpdate, canArchive }: Props) {
  const t = useTranslations("clients.detail");
  const tStatus = useTranslations("clients.status");
  const tCommon = useTranslations("common");
  const f = useFormat();
  const comingSoonTitle = tCommon("comingSoon");
  const formatEUR = (cents: number) => f.currencyCents(cents);

  const initials = detail.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const contractMonths = detail.contract?.start_date
    ? differenceInMonths(
        detail.contract.end_date
          ? new Date(detail.contract.end_date)
          : new Date(),
        new Date(detail.contract.start_date),
      )
    : null;

  const contractDuration =
    contractMonths !== null ? `— ${Math.max(0, contractMonths)}mo` : "—";

  // Clients are flagged "new" for 30 days from creation.
  const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const isNew =
    Date.now() - new Date(detail.created_at).getTime() < NEW_WINDOW_MS;
  const isAlltagshilfe = detail.customer_type === "alltagshilfe";

  return (
    <>
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500"
      >
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.clients} className="hover:text-neutral-700">
          {t("breadcrumbClients")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="truncate text-neutral-700">{detail.display_name}</span>
      </nav>

      {/* Hero card — left border accent matches the red left-border
          convention used on Alltagshilfe rows in ClientsTable. */}
      <section
        className={cn(
          "mb-6 rounded-lg border border-neutral-100 bg-white p-5",
          isAlltagshilfe && "border-l-2 border-l-error-400",
        )}
      >
        <div className="flex flex-wrap items-start gap-5">
          <span
            className={cn(
              "grid h-16 w-16 flex-shrink-0 place-items-center rounded-full text-[20px] font-bold text-white",
              isAlltagshilfe ? "bg-error-500" : "bg-primary-500",
            )}
          >
            {initials || "—"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-bold text-secondary-500">
                {detail.display_name}
              </h1>
              {isAlltagshilfe && (
                <span className="inline-flex rounded-full bg-error-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-error-700">
                  {t("alltagshilfeBadge")}
                </span>
              )}
              <PayerChip payer={detail.payer_type} size="sm" />
              {isNew && (
                <span
                  className={`inline-flex rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-white`}
                >
                  {t("newBadge")}
                </span>
              )}
              <StatusBadge
                status={
                  detail.contract?.status === "active"
                    ? "active"
                    : detail.contract?.status === "draft"
                      ? "onboarding"
                      : "ended"
                }
                t={tStatus}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-neutral-500">
              <Meta icon={iconBriefcase}>
                {detail.contract?.legal_form ?? "—"} · {tCustomerType(detail.customer_type)}
              </Meta>
              <Meta icon={iconPin}>
                {detail.email ?? "—"} {detail.phone ? `· ${detail.phone}` : ""}
              </Meta>
              <Meta icon={iconClock}>
                {t("clientSince", {
                  date: f.dateLong(detail.created_at),
                })}
              </Meta>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <HeroStat value={detail.property_count} label={t("statProperties")} />
              <HeroStat value={detail.contact_count} label={t("statContacts")} />
              <HeroStat value={detail.assignment_count} label={t("statAssignments")} />
              <HeroStat
                value={formatEUR(detail.ytd_invoiced_cents)}
                label={t("statYtd")}
              />
              <HeroStat value={contractDuration} label={t("statTerm")} />
            </div>
          </div>

          <ClientDetailActions
            id={detail.id}
            canUpdate={canUpdate}
            canArchive={canArchive}
          />
        </div>
      </section>

      {/* Tabs */}
      <section className="mb-5 rounded-lg border border-neutral-100 bg-white">
        <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-neutral-100 px-2 py-1.5 text-[13px]">
          <Tab active>{t("tabOverview")}</Tab>
          <Tab count={detail.property_count} disabledTitle={comingSoonTitle}>
            {t("tabProperties")}
          </Tab>
          <Tab disabledTitle={comingSoonTitle}>{t("tabContract")}</Tab>
          <Tab count={3} disabledTitle={comingSoonTitle}>
            {t("tabInvoices")}
          </Tab>
          <Tab count={6} disabledTitle={comingSoonTitle}>
            {t("tabDocuments")}
          </Tab>
          <Tab disabledTitle={comingSoonTitle}>{t("tabHistory")}</Tab>
        </div>
      </section>

      {/* Body grid: contacts/scope (left) + key information (right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <ContactsCard detail={detail} canUpdate={canUpdate} />
          <PropertiesPreviewCard detail={detail} />
          <ScopeOfServicesCard detail={detail} canUpdate={canUpdate} />
          <ActivityTimelineCard detail={detail} />
        </div>
        <KeyInformationCard detail={detail} canUpdate={canUpdate} />
      </div>

      {/* Internal notes */}
      <NotesCard detail={detail} canUpdate={canUpdate} />
    </>
  );
}

/* ============================================================================
 * Sub-components
 * ========================================================================== */

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-neutral-400">{icon}</span>
      {children}
    </span>
  );
}

function HeroStat({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div>
      <div className="text-[20px] font-bold leading-tight text-secondary-500">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function Tab({
  active,
  count,
  children,
  disabledTitle,
}: {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
  /** When set, renders the tab as disabled with this tooltip. */
  disabledTitle?: string;
}) {
  const disabled = !active && !!disabledTitle;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled ? "true" : undefined}
      tabIndex={disabled ? -1 : undefined}
      title={disabled ? disabledTitle : undefined}
      className={`relative inline-flex items-center gap-2 rounded-md px-3 py-2 ${
        active ? "text-primary-700" : "text-neutral-600"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
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
    </button>
  );
}

function ContactsCard({ detail, canUpdate }: { detail: Detail; canUpdate: boolean }) {
  const t = useTranslations("clients.detail");
  const contacts = [
    {
      label: t("contactPrimary"),
      role: detail.contact_name ?? "—",
      email: detail.email,
      phone: detail.phone,
      tone: "primary" as const,
    },
  ];

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("contactsTitle")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("contactsSubtitle", { count: contacts.length })}
          </div>
        </div>
        {canUpdate && (
          <button
            type="button"
            className="btn btn--tertiary cursor-not-allowed opacity-60"
            disabled
            aria-disabled="true"
            title={t("contactsAddComingSoon")}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("contactsAdd")}
          </button>
        )}
      </header>
      <div className="px-5 py-2">
        {contacts.map((c, i) => (
          // Local UI-only array (currently a single primary contact). Key
          // by the label which is i18n-stable across renders.
          <div
            key={c.label}
            className="flex flex-wrap items-center gap-3 border-b border-neutral-100 py-3.5 last:border-b-0"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary-500 text-[12px] font-bold text-white">
              P{i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-neutral-800">
                {c.label}
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-primary-700">
                  {t("primary")}
                </span>
              </div>
              <div className="text-[11px] text-neutral-500">{c.role}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-700">
              {c.email && <span>✉ {c.email}</span>}
              {c.phone && <span>☎ {c.phone}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Properties preview — shows up to 4 properties belonging to this
 * client with a thumbnail letter, frequency line, and status pill.
 * Links to the full /properties view filtered by client.
 *
 * The detail loader doesn't yet surface per-client property records,
 * so we render a CTA card linking to the filtered properties list.
 * When the loader is extended to return `detail.properties[]`, this
 * card lights up automatically.
 */
function PropertiesPreviewCard({ detail }: { detail: Detail }) {
  const t = useTranslations("clients.detail.propertiesPreview");
  const rows = detail.properties_preview ?? [];
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
        <div>
          <h3 className="text-[14px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={`${routes.properties}?client=${detail.id}` as never}
          className="text-[12px] font-semibold text-primary-700 hover:underline"
        >
          {t("viewAll")} →
        </Link>
      </header>
      {rows.length === 0 ? (
        <div className="p-5">
          <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-[12px] text-neutral-500">
            {t("emptyState")}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50"
            >
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-primary-50 text-[11px] font-bold text-primary-700">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <Link
                href={routes.property(p.id)}
                className="min-w-0 flex-1 hover:underline"
              >
                <div className="truncate text-[13px] font-semibold text-neutral-800">
                  {p.name}
                </div>
                <div className="truncate text-[11px] text-neutral-500">
                  {p.city}
                  {p.weekly_frequency
                    ? ` · ${t("frequency", { n: p.weekly_frequency })}`
                    : ""}
                </div>
              </Link>
              <span className="rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-success-700">
                {t("active")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Activity timeline — recent events affecting this client (created /
 * edited / invoiced / etc). The detail loader doesn't yet pull
 * audit_log rows scoped to the client, so for now this is an empty
 * state with a CTA to the audit log. Adding the audit query is a
 * small follow-up that doesn't touch this UI.
 */
function ActivityTimelineCard({ detail }: { detail: Detail }) {
  const t = useTranslations("clients.detail.activity");
  const f = useFormat();
  const events = detail.recent_activity ?? [];

  // Always show the "Kunde angelegt" event derived from created_at,
  // plus the audit-log entries. Newest entries first; we cap to 6
  // visible items so the card doesn't dominate the column.
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 px-5 py-4">
        <h3 className="text-[14px] font-semibold text-neutral-800">
          {t("title")}
        </h3>
        <p className="mt-0.5 text-[11px] text-neutral-500">{t("subtitle")}</p>
      </header>
      <ul className="px-5 py-4">
        {events.slice(0, 5).map((e, idx) => (
          <li
            key={e.id}
            className={cn(
              "flex items-start gap-3 border-l-2 border-secondary-300 pl-3",
              idx > 0 && "mt-3",
            )}
          >
            <span className="-ml-[7px] mt-0.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white bg-secondary-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-neutral-800">
                {e.summary}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                {e.actor_name && <span>{e.actor_name}</span>}
                <span className="font-mono">{f.date(e.created_at)}</span>
              </div>
            </div>
          </li>
        ))}
        <li
          className={cn(
            "flex items-start gap-3 border-l-2 border-success-500 pl-3",
            events.length > 0 && "mt-3",
          )}
        >
          <span className="-ml-[7px] mt-0.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white bg-success-500" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-neutral-800">
              {t("createdTitle")}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
              {f.date(detail.created_at)}
            </div>
          </div>
        </li>
      </ul>
    </section>
  );
}

function ScopeOfServicesCard({
  detail,
  canUpdate,
}: {
  detail: Detail;
  canUpdate: boolean;
}) {
  const t = useTranslations("clients.detail");
  // Sample static scope rows — connected to service_scopes table in next pass.
  void detail;
  const items = [
    { title: t("scopeFloor"), sub: t("scopeFloorSub"), tone: "primary" as const },
    { title: t("scopeWindows"), sub: t("scopeWindowsSub"), tone: "secondary" as const },
    { title: t("scopeWaste"), sub: t("scopeWasteSub"), tone: "primary" as const },
    { title: t("scopeCarpet"), sub: t("scopeCarpetSub"), tone: "primary" as const },
    { title: t("scopeSanitary"), sub: t("scopeSanitarySub"), tone: "primary" as const },
    { title: t("scopeEmergency"), sub: t("scopeEmergencySub"), tone: "primary" as const },
  ];

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-800">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-success-500"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {t("scopeTitle")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("scopeSubtitle")}
          </div>
        </div>
        {canUpdate && (
          <span className="text-[12px] font-medium text-primary-600">
            {t("scopeEdit")} →
          </span>
        )}
      </header>
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex items-center gap-3 rounded-md border border-neutral-100 bg-tertiary-200 px-3 py-2.5"
          >
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-white text-primary-600">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <rect x={3} y={3} width={18} height={18} rx={3} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-neutral-800">
                {item.title}
              </span>
              <span className="block truncate text-[11px] text-neutral-500">
                {item.sub}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function KeyInformationCard({
  detail,
  canUpdate,
}: {
  detail: Detail;
  canUpdate: boolean;
}) {
  const t = useTranslations("clients.detail");
  const f = useFormat();
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-800">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-secondary-500"
          >
            <circle cx={12} cy={12} r={10} />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          {t("keyInfoTitle")}
        </h3>
        {canUpdate && (
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-50"
            aria-label={t("edit")}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </header>
      <dl className="divide-y divide-neutral-100 px-5">
        <Row label={t("clientId")} value={`CLT-${detail.id.slice(0, 8).toUpperCase()}`} mono />
        <Row label={t("legalForm")} value={detail.contract?.legal_form ?? "—"} />
        <Row label={t("vatNumber")} value={detail.tax_id ?? "—"} mono />
        {/* Bug 4 — Alltagshilfe-specific fields are surfaced only when the
            client is an Alltagshilfe customer. */}
        {detail.customer_type === "alltagshilfe" && (
          <>
            <Row
              label={t("insuranceProvider")}
              value={detail.insurance_provider ?? "—"}
            />
            <Row
              label={t("insuranceNumber")}
              value={detail.insurance_number ?? "—"}
              mono
            />
            <Row
              label={t("careLevel")}
              value={
                detail.care_level
                  ? t("careLevelN", { level: detail.care_level })
                  : "—"
              }
            />
          </>
        )}
        <Row
          label={t("contractStart")}
          value={f.date(detail.contract?.start_date)}
          mono
        />
        {/*
          When `end_date` is null the contract is open-ended, so the duration
          renders as "—" rather than "(months since start)". The old code
          fell back to `new Date()` (now), which yielded a different month
          count on the server vs. the client at hydration time and warned in
          the browser. Showing "—" for open contracts is both deterministic
          and arguably the right UX: an ongoing relationship has no fixed
          duration to display.
        */}
        <Row
          label={t("contractDuration")}
          value={
            detail.contract?.start_date && detail.contract.end_date
              ? `${differenceInMonths(
                  new Date(detail.contract.end_date),
                  new Date(detail.contract.start_date),
                )} months`
              : "—"
          }
        />
        <Row
          label={t("noticePeriod")}
          value={
            detail.contract
              ? `${detail.contract.notice_period_days / 30} months`
              : "—"
          }
        />
        <Row
          label={t("projectManager")}
          value={
            <span className="inline-flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                P1
              </span>
              <span>Projektleitung 01</span>
            </span>
          }
        />
        <Row label={t("preferredLanguage")} value="Deutsch 🇩🇪" />
        <Row label={t("invoiceCurrency")} value="EUR · €" />
      </dl>
    </section>
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
        className={`text-right ${
          mono ? "font-mono text-neutral-700" : "text-neutral-800"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function NotesCard({
  detail,
  canUpdate,
}: {
  detail: Detail;
  canUpdate: boolean;
}) {
  const t = useTranslations("clients.detail");
  return (
    <section className="mt-5 rounded-lg border border-warning-50 bg-warning-50/40">
      <header className="flex items-center justify-between border-b border-warning-50 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-warning-700">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01" />
            </svg>
            {t("notesTitle")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("notesSubtitle")}
          </div>
        </div>
        {canUpdate && (
          <button
            type="button"
            className="btn btn--tertiary cursor-not-allowed opacity-60"
            disabled
            aria-disabled="true"
            title={t("notesAddComingSoon")}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("notesAdd")}
          </button>
        )}
      </header>
      <div className="p-5 text-[13px] leading-[1.55] text-neutral-700">
        {detail.notes ? detail.notes : <em className="text-neutral-500">{t("notesEmpty")}</em>}
      </div>
    </section>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: "active" | "review" | "onboarding" | "ended";
  t: (k: "active" | "review" | "onboarding" | "ended") => string;
}) {
  const map = {
    active: "bg-success-50 text-success-700",
    review: "bg-warning-50 text-warning-700",
    onboarding: "bg-secondary-50 text-secondary-600",
    ended: "bg-neutral-100 text-neutral-600",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.02em] ${map[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(status)}
    </span>
  );
}

function tCustomerType(t: Detail["customer_type"]) {
  return t === "alltagshilfe" ? "Alltagshilfe" : t === "residential" ? "Privat" : "Firma";
}

const iconBriefcase = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <rect x={3} y={7} width={18} height={13} rx={2} />
    <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const iconPin = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
    <circle cx={12} cy={10} r={3} />
  </svg>
);
const iconClock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <circle cx={12} cy={12} r={10} />
    <path d="M12 6v6l4 2" />
  </svg>
);
