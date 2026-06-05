"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { updateSettingsAction } from "@/app/actions/settings";
import type { SettingsData } from "@/lib/api/settings";
import { SecuritySection } from "./SecuritySection";
import { PushToggleCard } from "./PushToggleCard";
import { AvatarUpload } from "./AvatarUpload";
import { LogoUpload } from "./LogoUpload";
import { InviteEmployeeDialog } from "@/components/employees/InviteEmployeeDialog";
import { signOutOtherDevicesAction } from "@/app/actions/sessions";

/**
 * Settings — rebuild matching the prototype at
 * /Users/macbookpro/Desktop/hasseeb/Priya Prototype/13-settings.html.
 *
 * Two-tier section navigation:
 *   Geschäftsleitung
 *     01 · Firmenprofil
 *     02 · Team & Rollen
 *     03 · Steuer & Abrechnung
 *     04 · Integrationen
 *     05 · Benachrichtigungen
 *   Persönlich
 *     06 · Mein Konto
 *     07 · Sicherheit
 *     08 · Sitzungen & Geräte
 *
 * Each card carries a numbered ID badge (01 · Mgmt / 06 · Persönlich)
 * mirroring the prototype's `.sect-id` chip.
 *
 * All forms reuse the existing `updateSettingsAction` server action —
 * this is a visual/structural rebuild, not a backend change.
 */

const MGMT_SECTIONS = [
  "company",
  "team",
  "tax",
  "integrations",
  "notifications",
] as const;
const PERSONAL_SECTIONS = ["account", "security", "sessions"] as const;

type Section = (typeof MGMT_SECTIONS)[number] | (typeof PERSONAL_SECTIONS)[number];

type Props = { data: SettingsData; canEdit: boolean };

export function SettingsPage({ data, canEdit }: Props) {
  const t = useTranslations("settings");
  const [active, setActive] = useState<Section>("company");

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbAccount")}</span>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      {/* Page head + save bar */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">
            {t.rich("subtitleWithSaved", {
              at: (chunks) => (
                <b className="text-neutral-800">{chunks}</b>
              ),
              ts: "—",
            })}
          </p>
        </div>
      </div>

      {/* Two-column settings shell */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_1fr]">
        {/* Sticky section nav */}
        <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm xl:sticky xl:top-20">
          <SectionNavLabel>{t("navGroup.management")}</SectionNavLabel>
          {MGMT_SECTIONS.map((s) => (
            <SectionNavItem
              key={s}
              active={active === s}
              onClick={() => setActive(s)}
              label={t(`nav.${s}` as never)}
              icon={NAV_ICONS[s]}
              badge={NAV_BADGES[s]?.(data)}
            />
          ))}
          <div className="my-2 h-px bg-neutral-100" />
          <SectionNavLabel>{t("navGroup.personal")}</SectionNavLabel>
          {PERSONAL_SECTIONS.map((s) => (
            <SectionNavItem
              key={s}
              active={active === s}
              onClick={() => setActive(s)}
              label={t(`nav.${s}` as never)}
              icon={NAV_ICONS[s]}
              badge={NAV_BADGES[s]?.(data)}
            />
          ))}
          <div className="mt-2 border-t border-neutral-100 px-2.5 pt-2.5 text-[11px] leading-[1.5] text-neutral-500">
            <b className="mb-0.5 block text-[12px] text-neutral-800">
              {t("helpTitle")}
            </b>
            {t("helpBody")}
          </div>
        </aside>

        {/* Main content column */}
        <div className="flex min-w-0 flex-col gap-4">
          {active === "company" && (
            <CompanySection data={data} canEdit={canEdit} />
          )}
          {active === "team" && <TeamSection data={data} />}
          {active === "tax" && <TaxSection data={data} canEdit={canEdit} />}
          {active === "integrations" && (
            <IntegrationsSection data={data} canEdit={canEdit} />
          )}
          {active === "notifications" && (
            <NotificationsSection data={data} canEdit={canEdit} />
          )}
          {active === "account" && (
            <AccountSection data={data} canEdit={canEdit} />
          )}
          {active === "security" && <SecurityWrap />}
          {active === "sessions" && <SessionsSection />}
        </div>
      </div>
    </>
  );
}

/* ============================================================================
 *  NAV BUILDING BLOCKS
 * ========================================================================== */

const NAV_ICONS: Record<Section, React.ReactNode> = {
  company: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" />
      <path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h6" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx={9} cy={7} r={4} />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  tax: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2} y={5} width={20} height={14} rx={2} />
      <line x1={2} y1={10} x2={22} y2={10} />
    </svg>
  ),
  integrations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  sessions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2} y={3} width={20} height={14} rx={2} />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
};

const NAV_BADGES: Partial<Record<Section, (d: SettingsData) => string | null>> = {
  team: (d) => String(d.members.length),
  integrations: () => "3/6",
  sessions: () => "4",
};

function SectionNavLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
      {children}
    </div>
  );
}

function SectionNavItem({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-px flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition",
        active
          ? "bg-primary-50 font-semibold text-primary-700"
          : "text-neutral-700 hover:bg-neutral-100",
      )}
    >
      <span
        className={cn(
          "h-3.5 w-3.5 flex-shrink-0",
          active ? "text-primary-700" : "text-neutral-500",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className={cn(
            "ml-auto text-[10px] font-semibold",
            active ? "text-primary-700" : "text-neutral-500",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ============================================================================
 *  CARD WRAPPER + SHARED PIECES
 * ========================================================================== */

function Card({
  id,
  num,
  area,
  title,
  subtitle,
  actions,
  children,
  footer,
}: {
  id?: string;
  num: string;
  area: "mgmt" | "personal";
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.01em] text-neutral-800">
            <SectionIdChip area={area}>{num}</SectionIdChip>
            <span>{title}</span>
          </h2>
          <p className="mt-1 text-[12px] text-neutral-500">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3 text-[12px] text-neutral-500">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function SectionIdChip({
  area,
  children,
}: {
  area: "mgmt" | "personal";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        area === "mgmt"
          ? "bg-primary-50 text-primary-700"
          : "bg-secondary-50 text-secondary-700",
      )}
    >
      {children}
    </span>
  );
}

function SubH({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-neutral-500">
        {children}
      </h3>
      {right}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[12px] font-semibold text-neutral-700">
        {label}
        {hint && <span className="font-normal text-[11px] text-neutral-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function HR() {
  return <div className="my-5 h-px bg-neutral-100" />;
}

function SaveBar({
  pending,
  onSave,
  canEdit,
}: {
  pending: boolean;
  onSave: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations("settings");
  if (!canEdit) return null;
  return (
    <div className="mt-5 flex justify-end">
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className={cn("btn btn--primary", pending && "opacity-80")}
      >
        {pending ? "…" : t("save")}
      </button>
    </div>
  );
}

/* ============================================================================
 *  01 · FIRMENPROFIL
 * ========================================================================== */

function CompanySection({ data, canEdit }: { data: SettingsData; canEdit: boolean }) {
  const t = useTranslations("settings.company");
  const router = useRouter();
  const [pending, start] = useTransition();
  const company = (data.data.company ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    legalName: company.legalName ?? data.org.name,
    tradingName: company.tradingName ?? data.org.name,
    vatId: company.vatId ?? "",
    registration: company.registration ?? "",
    address: company.address ?? "",
    primaryContact: company.primaryContact ?? "",
    supportEmail: company.supportEmail ?? "",
    supportPhone: company.supportPhone ?? "",
  });

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    start(async () => {
      const r = await updateSettingsAction({ company: form });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t("savedToast"));
        router.refresh();
      }
    });
  }

  return (
    <Card num={t("badge")} area="mgmt" title={t("title")} subtitle={t("subtitle")}>
      {/* Brand top row — logo upload now lives in <LogoUpload />, which
       *  shows the real bitmap when available and falls back to the
       *  gradient initial tile when nothing has been uploaded yet. */}
      <div className="mb-5 grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-neutral-100 pb-5">
        <LogoUpload
          initialUrl={data.org.logo_url}
          fallbackLetter={
            (form.tradingName || data.org.name).charAt(0) || "P"
          }
          canEdit={canEdit}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em] text-neutral-800">
            <span className="truncate">{form.legalName || data.org.name}</span>
            <span
              title={t("verified")}
              className="grid h-[18px] w-[18px] place-items-center rounded-full bg-success-500 text-white"
            >
              <svg
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-neutral-500">
            <span>🇩🇪 Deutschland</span>
            <span>·</span>
            <span>{data.members.length} {t("members")}</span>
          </div>
        </div>
        <div />
      </div>

      {/* Legal */}
      <SubH>{t("legalRegistration")}</SubH>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("legalName")} hint={t("legalNameHint")}>
          <Input value={form.legalName} onChange={set("legalName")} disabled={!canEdit} />
        </Field>
        <Field label={t("tradingName")}>
          <Input value={form.tradingName} onChange={set("tradingName")} disabled={!canEdit} />
        </Field>
        <Field label={t("registration")}>
          <Input
            value={form.registration}
            onChange={set("registration")}
            disabled={!canEdit}
            mono
          />
        </Field>
        <Field label={t("vatId")}>
          <Input value={form.vatId} onChange={set("vatId")} disabled={!canEdit} mono />
        </Field>
        <Field label={t("supportEmail")}>
          <Input
            type="email"
            value={form.supportEmail}
            onChange={set("supportEmail")}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("supportPhone")}>
          <Input
            value={form.supportPhone}
            onChange={set("supportPhone")}
            disabled={!canEdit}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label={t("address")}>
            <textarea
              rows={2}
              value={form.address}
              onChange={set("address")}
              disabled={!canEdit}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
            />
          </Field>
        </div>
      </div>

      <HR />

      {/* Brand colours */}
      <SubH>{t("brandColors")}</SubH>
      <div className="flex flex-wrap gap-3">
        {[
          { hex: "#72A94F", name: "Primary" },
          { hex: "#16587C", name: "Secondary" },
          { hex: "#A8CC87", name: "Accent" },
          { hex: "#F4A261", name: "Warning" },
        ].map((s) => (
          <div key={s.hex} className="flex flex-col items-center gap-1">
            <span
              className="h-12 w-12 rounded-lg ring-1 ring-neutral-200"
              style={{ backgroundColor: s.hex }}
              aria-label={s.name}
            />
            <span className="font-mono text-[10px] text-neutral-500">{s.hex}</span>
          </div>
        ))}
      </div>

      <SaveBar pending={pending} onSave={save} canEdit={canEdit} />
    </Card>
  );
}

/* ============================================================================
 *  02 · TEAM & ROLLEN
 * ========================================================================== */

function TeamSection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings.team");
  // Reuse the existing employee-invite dialog rather than duplicate
  // the form. createEmployeeAction (admin-only) handles RBAC + the
  // supabase.auth.admin.inviteUserByEmail call so we stay consistent
  // with the dedicated /employees flow.
  const [inviteOpen, setInviteOpen] = useState(false);

  // Static role-matrix capabilities — these mirror the prototype.
  // Each row shows which roles get the capability; values: y / n / p
  // (partial), and `pLabel` for the partial chip text.
  const CAPS: Array<{
    keyMain: string;
    keyDesc: string;
    cells: Array<"y" | "n" | { p: string }>;
  }> = [
    {
      keyMain: "capViewPlan",
      keyDesc: "capViewPlanDesc",
      cells: ["y", "y", "y", { p: "own" }],
    },
    {
      keyMain: "capAssign",
      keyDesc: "capAssignDesc",
      cells: ["y", "y", "n", "n"],
    },
    {
      keyMain: "capManageClients",
      keyDesc: "capManageClientsDesc",
      cells: ["y", { p: "read" }, "n", "n"],
    },
    {
      keyMain: "capInvoicing",
      keyDesc: "capInvoicingDesc",
      cells: ["y", "n", "n", "n"],
    },
    {
      keyMain: "capApproveTime",
      keyDesc: "capApproveTimeDesc",
      cells: ["y", "y", "n", "n"],
    },
    {
      keyMain: "capReports",
      keyDesc: "capReportsDesc",
      cells: ["y", { p: "ltd" }, "n", { p: "own" }],
    },
    {
      keyMain: "capOrgSettings",
      keyDesc: "capOrgSettingsDesc",
      cells: ["y", "n", "n", "n"],
    },
  ];

  return (
    <>
    <Card
      num={t("badge")}
      area="mgmt"
      title={t("title")}
      subtitle={t("subtitleN", { n: data.members.length })}
      actions={
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="btn btn--primary btn--sm"
        >
          <PlusIcon /> {t("invite")}
        </button>
      }
    >
      <SubH>{t("matrixTitle")}</SubH>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                {t("capability")}
              </th>
              {(["mgmt", "sup", "empl", "client"] as const).map((r) => (
                <th key={r} className="w-[18%] px-2 py-2 text-center text-[11px] font-bold uppercase">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={cn(
                      r === "mgmt" && "text-primary-700",
                      r === "sup" && "text-secondary-700",
                      r === "empl" && "text-success-700",
                      r === "client" && "text-warning-700",
                    )}>
                      {t(`role.${r}` as never)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPS.map((row, idx) => (
              <tr key={idx} className="border-t border-neutral-100">
                <td className="py-3 pr-3 align-top text-[13px] font-medium text-neutral-800">
                  {t(row.keyMain as never)}
                  <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">
                    {t(row.keyDesc as never)}
                  </span>
                </td>
                {row.cells.map((c, i) => (
                  <td key={i} className="py-3 text-center align-middle">
                    <CheckCell cell={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HR />

      <SubH right={<Link href="#" className="text-[12px] font-semibold text-primary-700">{t("seeAll")} →</Link>}>
        {t("activeMembers", { n: data.members.length })}
      </SubH>
      <div className="flex flex-col divide-y divide-neutral-100">
        {data.members.slice(0, 6).map((m, i) => (
          <div
            key={m.id}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-1 py-2.5"
          >
            <span
              className={cn(
                "grid h-[34px] w-[34px] place-items-center rounded-full text-[11px] font-bold text-white",
                AVATAR_BG[i % AVATAR_BG.length],
              )}
            >
              {initials(m.full_name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-neutral-800">
                {m.full_name}
              </div>
              <div className="truncate text-[11px] text-neutral-500">
                {m.email ?? "—"}
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                m.role === "admin"
                  ? "bg-primary-50 text-primary-700"
                  : m.role === "dispatcher"
                    ? "bg-secondary-50 text-secondary-700"
                    : "bg-success-50 text-success-700",
              )}
            >
              {t(`role.${m.role === "admin" ? "mgmt" : m.role === "dispatcher" ? "sup" : "empl"}` as never)}
            </span>
            <button type="button" className="text-neutral-400 hover:text-neutral-700">
              <KebabIcon />
            </button>
          </div>
        ))}
      </div>
    </Card>
    <InviteEmployeeDialog
      open={inviteOpen}
      onClose={() => setInviteOpen(false)}
    />
    </>
  );
}

const AVATAR_BG = [
  "bg-primary-500",
  "bg-secondary-500",
  "bg-warning-500",
  "bg-accent-600",
  "bg-secondary-600",
  "bg-neutral-600",
] as const;

function CheckCell({ cell }: { cell: "y" | "n" | { p: string } }) {
  if (cell === "y")
    return (
      <span className="inline-grid h-[22px] w-[22px] place-items-center rounded-md bg-success-50 text-success-700">
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  if (cell === "n")
    return (
      <span className="inline-grid h-[22px] w-[22px] place-items-center rounded-md bg-neutral-100 text-neutral-400">
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <line x1={18} y1={6} x2={6} y2={18} />
          <line x1={6} y1={6} x2={18} y2={18} />
        </svg>
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md bg-warning-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-warning-700">
      {cell.p}
    </span>
  );
}

/* ============================================================================
 *  03 · STEUER & ABRECHNUNG
 * ========================================================================== */

function TaxSection({ data, canEdit }: { data: SettingsData; canEdit: boolean }) {
  const t = useTranslations("settings.tax");
  const router = useRouter();
  const [pending, start] = useTransition();
  const tax = (data.data.tax ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    vatRate: String(tax.vatRate ?? "19"),
    currency: String(tax.currency ?? "EUR"),
    invoicePrefix: String(tax.invoicePrefix ?? "INV-{YYYY}-{####}"),
    paymentTerms: String(tax.paymentTerms ?? "14"),
    lateFee: String(tax.lateFee ?? "5"),
  });

  function save() {
    start(async () => {
      const r = await updateSettingsAction({ tax: form });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t("savedToast"));
        router.refresh();
      }
    });
  }

  return (
    <Card num={t("badge")} area="mgmt" title={t("title")} subtitle={t("subtitle")}>
      {/* Plan card */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-5 rounded-lg border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-700">
            ● {t("currentPlan")}
          </div>
          <div className="text-[19px] font-bold tracking-[-0.01em]">
            {t("planTier")}
            <small className="ml-2 text-[12px] font-medium text-neutral-500">
              · {t("planTierSub")}
            </small>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-5 text-[12px]">
            <PlanStat value={`${data.members.length} / 50`} label={t("planMembers")} />
            <PlanStat value="10 / 20" label={t("planObjects")} />
            <PlanStat value={t("unlimited")} label={t("planInvoices")} />
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[26px] font-bold tracking-[-0.02em]">€149</div>
          <div className="text-[12px] text-neutral-500">{t("perMonth")}</div>
          <button className="btn btn--primary btn--sm mt-2">{t("managePlan")}</button>
        </div>
      </div>

      <HR />

      <SubH>{t("vatCompliance")}</SubH>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("vatId")}>
          <Input
            mono
            value={form.invoicePrefix}
            onChange={(e) => setForm((p) => ({ ...p, invoicePrefix: e.target.value }))}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("vatRate")}>
          <Select
            value={form.vatRate}
            onChange={(e) => setForm((p) => ({ ...p, vatRate: e.target.value }))}
            disabled={!canEdit}
          >
            <option value="19">{t("vatStd")} · 19 %</option>
            <option value="7">{t("vatReduced")} · 7 %</option>
          </Select>
        </Field>
      </div>

      <HR />

      <SubH>{t("invoiceDefaults")}</SubH>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("paymentTerms")}>
          <Select
            value={form.paymentTerms}
            onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))}
            disabled={!canEdit}
          >
            <option value="14">{t("net14")}</option>
            <option value="7">{t("net7")}</option>
            <option value="30">{t("net30")}</option>
          </Select>
        </Field>
        <Field label={t("currency")}>
          <Select
            value={form.currency}
            onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
            disabled={!canEdit}
          >
            <option value="EUR">EUR · €</option>
          </Select>
        </Field>
        <Field label={t("lateFee")}>
          <Input
            type="number"
            step="0.01"
            value={form.lateFee}
            onChange={(e) => setForm((p) => ({ ...p, lateFee: e.target.value }))}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <SaveBar pending={pending} onSave={save} canEdit={canEdit} />
    </Card>
  );
}

function PlanStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="block font-mono text-[14px] font-bold text-neutral-800">{value}</b>
      <span className="text-neutral-500">{label}</span>
    </div>
  );
}

/* ============================================================================
 *  04 · INTEGRATIONEN
 * ========================================================================== */

function IntegrationsSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.integrations");
  const router = useRouter();
  const [pending, start] = useTransition();
  const integrations = (data.data.integrations ?? {}) as Record<string, boolean>;

  const items: Array<{ id: string; logo: string; tone: string }> = [
    { id: "lexware", logo: "L", tone: "bg-neutral-800" },
    { id: "stripe", logo: "S", tone: "bg-[#635BFF]" },
    { id: "email", logo: "@", tone: "bg-secondary-600" },
    { id: "google", logo: "G", tone: "bg-[#EA4335]" },
    { id: "whatsapp", logo: "#", tone: "bg-[#4A154B]" },
    { id: "twilio", logo: "T", tone: "bg-[#2CA01C]" },
  ];

  function toggle(id: string, on: boolean) {
    start(async () => {
      const next = { ...integrations, [id]: on };
      const r = await updateSettingsAction({ integrations: next });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t("savedToast"));
        router.refresh();
      }
    });
  }

  return (
    <Card
      num={t("badge")}
      area="mgmt"
      title={t("title")}
      subtitle={t("subtitle", { active: 3, total: 6 })}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => {
          const on = !!integrations[it.id];
          return (
            <div
              key={it.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-md border p-3.5 transition",
                on
                  ? "border-primary-200 bg-gradient-to-b from-primary-50 to-transparent"
                  : "border-neutral-200 bg-white hover:border-neutral-300",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-[14px] font-bold text-white",
                    it.tone,
                  )}
                >
                  {it.logo}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-neutral-800">
                    {t(`${it.id}.name` as never)}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {t(`${it.id}.tagline` as never)}
                  </div>
                </div>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    on
                      ? "bg-success-50 text-success-700"
                      : "bg-neutral-100 text-neutral-500",
                  )}
                >
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-success-500" />}
                  {on ? t("active") : t("notConnected")}
                </span>
              </div>
              <p className="min-h-[34px] text-[12px] leading-[1.45] text-neutral-500">
                {t(`${it.id}.desc` as never)}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                <span>{on ? t("recentlySynced") : t("freeAllPlans")}</span>
                <button
                  type="button"
                  onClick={() => toggle(it.id, !on)}
                  disabled={!canEdit || pending}
                  className="text-[12px] font-semibold text-primary-700 hover:underline disabled:opacity-50"
                >
                  {on ? t("configure") : `${t("connect")} →`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <HR />

      <SubH
        right={
          <Link
            href={routes.apiKeys}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <PlusIcon /> {t("manageKeys")}
          </Link>
        }
      >
        {t("apiKeysTitle")}
      </SubH>
      <div className="flex items-start gap-2.5 rounded-md border border-warning-500 bg-warning-50 px-3 py-2.5 text-[12px] text-warning-700">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
          <path d="M12 9v2m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
        <span>{t("apiKeysWarning")}</span>
      </div>
    </Card>
  );
}

/* ============================================================================
 *  05 · BENACHRICHTIGUNGEN
 * ========================================================================== */

function NotificationsSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const router = useRouter();
  const [pending, start] = useTransition();

  type Channel = "in_app" | "email" | "whatsapp";
  type Event =
    | "new_client"
    | "shift_change"
    | "missed_checkin"
    | "invoice_overdue"
    | "vacation_request";
  const noti =
    (data.data.notifications ?? {
      new_client: { in_app: true, email: true, whatsapp: false },
      shift_change: { in_app: true, email: false, whatsapp: true },
      missed_checkin: { in_app: true, email: true, whatsapp: true },
      invoice_overdue: { in_app: true, email: true, whatsapp: false },
      vacation_request: { in_app: true, email: true, whatsapp: false },
    }) as Record<Event, Record<Channel, boolean>>;

  const groups: Array<{ id: string; events: Array<{ id: Event; key: string; desc: string }> }> = [
    {
      id: "ops",
      events: [
        { id: "shift_change", key: "evShiftChange", desc: "evShiftChangeDesc" },
        { id: "missed_checkin", key: "evMissedCheckin", desc: "evMissedCheckinDesc" },
      ],
    },
    {
      id: "finance",
      events: [
        { id: "invoice_overdue", key: "evInvoiceOverdue", desc: "evInvoiceOverdueDesc" },
      ],
    },
    {
      id: "team",
      events: [
        { id: "vacation_request", key: "evVacationRequest", desc: "evVacationRequestDesc" },
        { id: "new_client", key: "evNewClient", desc: "evNewClientDesc" },
      ],
    },
  ];
  const channels: Array<{ id: Channel; key: string }> = [
    { id: "in_app", key: "channelInApp" },
    { id: "email", key: "channelEmail" },
    { id: "whatsapp", key: "channelWhatsapp" },
  ];

  function flip(ev: Event, ch: Channel, on: boolean) {
    start(async () => {
      const next = { ...noti, [ev]: { ...noti[ev], [ch]: on } };
      const r = await updateSettingsAction({ notifications: next });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t("savedToast"));
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PushToggleCard />
      <Card
        num={t("badge")}
        area="mgmt"
        title={t("title")}
        subtitle={t("subtitle")}
        footer={
          <>
            <span>{t.rich("quietHours", { b: (c) => <b className="text-neutral-800">{c}</b> })}</span>
            <a href="#" className="font-semibold text-primary-700">{t("editQuietHours")} →</a>
          </>
        }
      >
        {/* Header row */}
        <div className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2.5 border-b border-neutral-200 pb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-500">
          <span />
          {channels.map((c) => (
            <span key={c.id} className="text-center">{t(c.key as never)}</span>
          ))}
        </div>
        {groups.map((g) => (
          <div key={g.id} className="mt-3 first:mt-0">
            <div className="py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
              {t(`group.${g.id}` as never)}
            </div>
            {g.events.map((ev) => (
              <div
                key={ev.id}
                className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2.5 border-b border-neutral-100 py-2.5"
              >
                <div>
                  <div className="text-[12px] font-semibold text-neutral-700">
                    {t(ev.key as never)}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {t(ev.desc as never)}
                  </div>
                </div>
                {channels.map((c) => {
                  const on = noti[ev.id]?.[c.id] ?? false;
                  return (
                    <div key={c.id} className="flex justify-center">
                      <Toggle on={on} onClick={() => flip(ev.id, c.id, !on)} disabled={!canEdit || pending} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "relative h-[19px] w-[34px] flex-shrink-0 rounded-full transition disabled:opacity-50",
        on ? "bg-primary-500" : "bg-neutral-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 block h-[15px] w-[15px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition",
          on ? "left-[17px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/* ============================================================================
 *  06 · MEIN KONTO  (locale + profile combined)
 * ========================================================================== */

function AccountSection({ data, canEdit }: { data: SettingsData; canEdit: boolean }) {
  const t = useTranslations("settings.account");
  const router = useRouter();
  const [pending, start] = useTransition();
  const locale = (data.data.locale ?? {}) as Record<string, string>;
  // Always source from `data.me` (the freshly-loaded current user's
  // profile) — not the org-wide members list, which doesn't surface
  // avatar_url, email, or the actual signed-in user.
  const me = data.me;
  const [form, setForm] = useState({
    fullName: me.full_name,
    email: me.email ?? "",
    language: locale.language ?? "de",
    timezone: locale.timezone ?? "Europe/Berlin",
    weekStart: locale.weekStart ?? "monday",
    dateFormat: locale.dateFormat ?? "dd.MM.yyyy",
  });

  function save() {
    start(async () => {
      const r = await updateSettingsAction({
        locale: {
          language: form.language,
          timezone: form.timezone,
          weekStart: form.weekStart,
          dateFormat: form.dateFormat,
        },
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t("savedToast"));
        router.refresh();
      }
    });
  }

  return (
    <Card num={t("badge")} area="personal" title={t("title")} subtitle={t("subtitle")}>
      <div className="mb-5 grid grid-cols-[auto_1fr] items-center gap-5 border-b border-neutral-100 pb-5">
        <AvatarUpload
          initialUrl={me.avatar_url}
          initials={initials(form.fullName || "—")}
          fullName={form.fullName || me.email || "—"}
        />
        <div className="min-w-0">
          <div className="text-[16px] font-bold tracking-[-0.01em]">{form.fullName}</div>
          <div className="mt-0.5 font-mono text-[12px] text-neutral-500">{form.email}</div>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-primary-700">
            {me.role}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("fullName")}>
          <Input
            value={form.fullName}
            onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            disabled
          />
        </Field>
        <Field label={t("email")}>
          <Input
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            disabled
          />
        </Field>
        <Field label={t("language")}>
          <Select
            value={form.language}
            onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
            disabled={!canEdit}
          >
            <option value="de">Deutsch (DE)</option>
            <option value="en">English (EN)</option>
            <option value="ta">தமிழ் (TA)</option>
          </Select>
        </Field>
        <Field label={t("timezone")}>
          <Input
            value={form.timezone}
            onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("weekStart")}>
          <Select
            value={form.weekStart}
            onChange={(e) => setForm((p) => ({ ...p, weekStart: e.target.value }))}
            disabled={!canEdit}
          >
            <option value="monday">{t("monday")}</option>
            <option value="sunday">{t("sunday")}</option>
          </Select>
        </Field>
        <Field label={t("dateFormat")}>
          <Input
            value={form.dateFormat}
            onChange={(e) => setForm((p) => ({ ...p, dateFormat: e.target.value }))}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <SaveBar pending={pending} onSave={save} canEdit={canEdit} />
    </Card>
  );
}

/* ============================================================================
 *  07 · SICHERHEIT  (reuses existing SecuritySection internals)
 * ========================================================================== */

function SecurityWrap() {
  const t = useTranslations("settings.security");
  return (
    <Card
      num={t("badge")}
      area="personal"
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-success-700">
          {t("strongScore")}
        </span>
      }
    >
      <SecuritySection />
    </Card>
  );
}

/* ============================================================================
 *  08 · SITZUNGEN & GERÄTE  (static for now — we don't track sessions yet)
 * ========================================================================== */

function SessionsSection() {
  const t = useTranslations("settings.sessions");
  const router = useRouter();
  const [pending, start] = useTransition();

  function signOutOthers() {
    if (
      !confirm(
        // Native confirm is fine here: this is a destructive action
        // executed rarely enough that a custom modal would be overkill.
        t("revokeAllConfirm"),
      )
    ) {
      return;
    }
    start(async () => {
      const r = await signOutOtherDevicesAction();
      if (r.ok) {
        toast.success(t("revokeAllSuccess"));
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Card
      num={t("badge")}
      area="personal"
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <button
          type="button"
          onClick={signOutOthers}
          disabled={pending}
          className="btn btn--ghost border border-error-100 bg-white text-error-700 hover:bg-error-50 btn--sm disabled:opacity-50"
        >
          {pending ? t("revokeAllPending") : t("revokeAll")}
        </button>
      }
      footer={
        <>
          <span>{t("footerNote")}</span>
          <a href="#" className="font-semibold text-primary-700">{t("auditLog")} →</a>
        </>
      }
    >
      <div className="flex flex-col divide-y divide-neutral-100">
        {[
          { device: t("currentDevice"), current: true, geo: "Berlin, DE", last: t("activeNow") },
          { device: "iPhone · iOS App", current: false, geo: "Berlin, DE", last: "38 min" },
        ].map((d, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-3"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <rect x={2} y={3} width={20} height={14} rx={2} />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-neutral-800">
                {d.device}
                {d.current && (
                  <span className="rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-success-700">
                    {t("thisDevice")}
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[11px] text-neutral-500">
                🇩🇪 {d.geo}
              </div>
            </div>
            <div className="text-[11px] text-neutral-500">{d.last}</div>
            {!d.current && (
              <button className="rounded-md border border-error-100 bg-white px-2 py-1 text-[11px] font-semibold text-error-700 hover:bg-error-50">
                {t("revoke")}
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================================================================
 *  SHARED INPUTS / ICONS
 * ========================================================================== */

function Input({
  mono,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      {...rest}
      className={cn(
        "rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60",
        mono && "font-mono text-[12px]",
        className,
      )}
    />
  );
}

function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60",
        className,
      )}
    >
      {children}
    </select>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={1} />
      <circle cx={19} cy={12} r={1} />
      <circle cx={5} cy={12} r={1} />
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
