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

const SECTIONS = [
  "company",
  "team",
  "tax",
  "integrations",
  "notifications",
  "locale",
  "security",
] as const;

type Section = (typeof SECTIONS)[number];

type Props = { data: SettingsData; canEdit: boolean };

export function SettingsPage({ data, canEdit }: Props) {
  const t = useTranslations("settings");
  const tNav = useTranslations("settings.nav");
  const [active, setActive] = useState<Section>("company");

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6">
        <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
          {t("title")}
        </h1>
        <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="flex h-fit flex-col gap-1 rounded-lg border border-neutral-100 bg-white p-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActive(s)}
              className={cn(
                "rounded-md px-3 py-2 text-left text-[13px] font-medium transition",
                active === s
                  ? "bg-primary-500 text-white"
                  : "text-neutral-700 hover:bg-neutral-50",
              )}
            >
              {tNav(s)}
            </button>
          ))}
        </aside>

        <div>
          {active === "company" && <CompanySection data={data} canEdit={canEdit} />}
          {active === "team" && <TeamSection data={data} />}
          {active === "tax" && <TaxSection data={data} canEdit={canEdit} />}
          {active === "integrations" && (
            <IntegrationsSection data={data} canEdit={canEdit} />
          )}
          {active === "notifications" && (
            <NotificationsSection data={data} canEdit={canEdit} />
          )}
          {active === "locale" && <LocaleSection data={data} canEdit={canEdit} />}
          {active === "security" && <SecuritySection />}
        </div>
      </div>
    </>
  );
}

/* ---------- helper: form section wrapper ---------- */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h2 className="text-[17px] font-bold text-secondary-500">{title}</h2>
        <p className="mt-1 text-[12px] text-neutral-500">{subtitle}</p>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
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

/* ---------- 01 Company ---------- */
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
        toast.success("Saved");
        router.refresh();
      }
    });
  }

  return (
    <Section title={t("title")} subtitle={t("subtitle")}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("legalName")}>
          <input className="input" value={form.legalName} onChange={set("legalName")} disabled={!canEdit} />
        </Field>
        <Field label={t("tradingName")}>
          <input className="input" value={form.tradingName} onChange={set("tradingName")} disabled={!canEdit} />
        </Field>
        <Field label={t("vatId")}>
          <input className="input" value={form.vatId} onChange={set("vatId")} disabled={!canEdit} />
        </Field>
        <Field label={t("registration")}>
          <input className="input" value={form.registration} onChange={set("registration")} disabled={!canEdit} />
        </Field>
        <Field label={t("address")}>
          <textarea
            rows={2}
            className="input min-h-[64px]"
            value={form.address}
            onChange={set("address")}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("primaryContact")}>
          <input className="input" value={form.primaryContact} onChange={set("primaryContact")} disabled={!canEdit} />
        </Field>
        <Field label={t("supportEmail")}>
          <input
            type="email"
            className="input"
            value={form.supportEmail}
            onChange={set("supportEmail")}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("supportPhone")}>
          <input className="input" value={form.supportPhone} onChange={set("supportPhone")} disabled={!canEdit} />
        </Field>
      </div>
      <SaveBar pending={pending} onSave={save} canEdit={canEdit} />
    </Section>
  );
}

/* ---------- 02 Team ---------- */
function TeamSection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings.team");
  return (
    <Section title={t("title")} subtitle={t("subtitle")}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                {t("members")}
              </th>
              <th className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                {t("role")}
              </th>
              <th className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                Email
              </th>
            </tr>
          </thead>
          <tbody>
            {data.members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[12px] text-neutral-500">
                  —
                </td>
              </tr>
            )}
            {data.members.map((m) => (
              <tr key={m.id} className="border-b border-neutral-100 last:border-b-0">
                <td className="px-4 py-3 align-middle">
                  <span className="text-[13px] font-medium text-neutral-800">
                    {m.full_name}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      m.role === "admin"
                        ? "bg-primary-50 text-primary-700"
                        : m.role === "dispatcher"
                          ? "bg-secondary-50 text-secondary-700"
                          : "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-[12px] text-neutral-500">
                  {m.email ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------- 03 Tax & billing ---------- */
function TaxSection({ data, canEdit }: { data: SettingsData; canEdit: boolean }) {
  const t = useTranslations("settings.tax");
  const router = useRouter();
  const [pending, start] = useTransition();
  const tax = (data.data.tax ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    vatRate: String(tax.vatRate ?? "19"),
    currency: String(tax.currency ?? "EUR"),
    invoicePrefix: String(tax.invoicePrefix ?? "INV-"),
    paymentTerms: String(tax.paymentTerms ?? "14"),
    lateFee: String(tax.lateFee ?? "5"),
  });
  function save() {
    start(async () => {
      const r = await updateSettingsAction({ tax: form });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved");
        router.refresh();
      }
    });
  }
  return (
    <Section title={t("title")} subtitle={t("subtitle")}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("vatRate")}>
          <input
            type="number"
            className="input"
            value={form.vatRate}
            onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("currency")}>
          <input
            className="input"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("invoicePrefix")}>
          <input
            className="input"
            value={form.invoicePrefix}
            onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("paymentTerms")}>
          <input
            type="number"
            className="input"
            value={form.paymentTerms}
            onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("lateFee")}>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.lateFee}
            onChange={(e) => setForm({ ...form, lateFee: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
      </div>
      <SaveBar pending={pending} onSave={save} canEdit={canEdit} />
    </Section>
  );
}

/* ---------- 04 Integrations ---------- */
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

  const items: Array<{ id: string; nameKey: string; descKey: string }> = [
    { id: "lexware", nameKey: "lexware", descKey: "lexwareDesc" },
    { id: "whatsapp", nameKey: "whatsapp", descKey: "whatsappDesc" },
    { id: "email", nameKey: "email", descKey: "emailDesc" },
    { id: "google", nameKey: "google", descKey: "googleDesc" },
    { id: "stripe", nameKey: "stripe", descKey: "stripeDesc" },
    { id: "twilio", nameKey: "twilio", descKey: "twilioDesc" },
  ];

  function toggle(id: string, on: boolean) {
    start(async () => {
      const next = { ...integrations, [id]: on };
      const r = await updateSettingsAction({ integrations: next });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved");
        router.refresh();
      }
    });
  }

  return (
    <Section title={t("title")} subtitle={t("subtitle")}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((it) => {
          const on = !!integrations[it.id];
          return (
            <div
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-md border border-neutral-100 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-neutral-800">
                  {t(it.nameKey as never)}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {t(it.descKey as never)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(it.id, !on)}
                disabled={!canEdit || pending}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] transition",
                  on
                    ? "bg-success-50 text-success-700 hover:bg-success-50"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
                )}
              >
                {on ? t("active") : t("connect")}
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ---------- 05 Notifications ---------- */
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

  const events: Array<{ id: Event; key: string }> = [
    { id: "new_client", key: "evNewClient" },
    { id: "shift_change", key: "evShiftChange" },
    { id: "missed_checkin", key: "evMissedCheckin" },
    { id: "invoice_overdue", key: "evInvoiceOverdue" },
    { id: "vacation_request", key: "evVacationRequest" },
  ];
  const channels: Array<{ id: Channel; key: string }> = [
    { id: "in_app", key: "channelInApp" },
    { id: "email", key: "channelEmail" },
    { id: "whatsapp", key: "channelWhatsapp" },
  ];

  function flip(ev: Event, ch: Channel, on: boolean) {
    start(async () => {
      const next = {
        ...noti,
        [ev]: { ...noti[ev], [ch]: on },
      };
      const r = await updateSettingsAction({ notifications: next });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <PushToggleCard />
    <Section title={t("title")} subtitle={t("subtitle")}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-[11px] font-semibold uppercase text-neutral-500">
                Event
              </th>
              {channels.map((c) => (
                <th
                  key={c.id}
                  className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-center text-[11px] font-semibold uppercase text-neutral-500"
                >
                  {t(c.key as never)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className="border-b border-neutral-100 last:border-b-0">
                <td className="px-4 py-3 align-middle text-[13px] text-neutral-800">
                  {t(ev.key as never)}
                </td>
                {channels.map((c) => {
                  const on = noti[ev.id]?.[c.id] ?? false;
                  return (
                    <td key={c.id} className="px-4 py-3 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => flip(ev.id, c.id, !on)}
                        disabled={!canEdit || pending}
                        className={cn(
                          "h-5 w-9 rounded-full transition",
                          on ? "bg-primary-500" : "bg-neutral-200",
                        )}
                      >
                        <span
                          className={cn(
                            "block h-4 w-4 rounded-full bg-white transition",
                            on ? "translate-x-[19px]" : "translate-x-0.5",
                          )}
                        />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
    </div>
  );
}

/* ---------- 06 Locale ---------- */
function LocaleSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.locale");
  const router = useRouter();
  const [pending, start] = useTransition();
  const locale = (data.data.locale ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    language: locale.language ?? "de",
    timezone: locale.timezone ?? "Europe/Berlin",
    weekStart: locale.weekStart ?? "monday",
    currency: locale.currency ?? "EUR",
    dateFormat: locale.dateFormat ?? "dd.MM.yyyy",
  });
  function save() {
    start(async () => {
      const r = await updateSettingsAction({ locale: form });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved");
        router.refresh();
      }
    });
  }
  return (
    <Section title={t("title")} subtitle={t("subtitle")}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("language")}>
          <select
            className="input"
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            disabled={!canEdit}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="ta">தமிழ்</option>
          </select>
        </Field>
        <Field label={t("timezone")}>
          <input
            className="input"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("weekStart")}>
          <select
            className="input"
            value={form.weekStart}
            onChange={(e) => setForm({ ...form, weekStart: e.target.value })}
            disabled={!canEdit}
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </Field>
        <Field label={t("currency")}>
          <input
            className="input"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("dateFormat")}>
          <input
            className="input"
            value={form.dateFormat}
            onChange={(e) => setForm({ ...form, dateFormat: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
      </div>
      <SaveBar pending={pending} onSave={save} canEdit={canEdit} />
    </Section>
  );
}
