import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Kunde anlegen" };

/**
 * /clients/new — customer-type picker (15-customer-type-picker.html).
 * Modal-style page with two cards. Visiting any sub-route requires
 * client.create permission. Anyone without it gets bounced to the list.
 */
export default async function NewClientPickerPage() {
  try {
    await requirePermission("client.create");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.clients);
    throw err;
  }
  const t = await getTranslations("clients.picker");

  return (
    <div className="grid place-items-center py-4">
      <div className="w-full max-w-[940px] rounded-xl border border-neutral-100 bg-white p-7 shadow-md">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-primary-700">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-500 text-[11px] font-bold text-white">
              1
            </span>
            {t("step")}
          </span>
          <Link
            href={routes.clients}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
            aria-label={t("cancel")}
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
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </Link>
        </div>

        <h1 className="mb-2 text-[22px] font-bold text-secondary-500">
          {t("title")}
        </h1>
        <p className="mb-7 max-w-[680px] text-[13px] leading-[1.6] text-neutral-600">
          {t("intro")}
        </p>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Priya's */}
          <ChoiceCard
            tone="green"
            tagLabel={t("labelGreen")}
            tagSub={t("priyaTagExisting")}
            iconBg="bg-primary-500 text-white"
            icon={
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M12 2l2 5 5 1-3.5 4 1 5L12 15l-4.5 2 1-5L5 8l5-1z" />
              </svg>
            }
            title={t("priyaTitle")}
            subtitle={t("priyaSubtitle")}
            rows={[
              { label: t("billing"), value: t("priyaBilling"), accent: "primary" },
              { label: t("customers"), value: t("priyaCustomers") },
              { label: t("staff"), value: t("priyaStaff") },
              { label: t("color"), value: t("priyaColor") },
            ]}
            ctaLabel={t("priyaCta")}
            ctaTone="primary"
            href={routes.clientNewType("commercial")}
          />

          {/* Alltagshilfe */}
          <ChoiceCard
            tone="red"
            tagLabel={t("labelRed")}
            tagSub={t("alltagsTagNew")}
            iconBg="bg-error-500 text-white"
            icon={
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
              </svg>
            }
            title={t("alltagsTitle")}
            subtitle={t("alltagsSubtitle")}
            rows={[
              { label: t("billing"), value: t("alltagsBilling"), accent: "error" },
              { label: t("customers"), value: t("alltagsCustomers") },
              { label: t("staff"), value: t("alltagsStaff") },
              { label: t("color"), value: t("alltagsColor") },
            ]}
            ctaLabel={t("alltagsCta")}
            ctaTone="error"
            href={routes.clientNewType("alltagshilfe")}
          />
        </div>

        <div className="mt-7 rounded-md border border-neutral-100 bg-neutral-50 px-4 py-3 text-[12px] text-neutral-600">
          <span className="mr-1.5 align-middle">ℹ️</span>
          {t("hint")}
        </div>

        <div className="mt-5 flex items-center gap-2 text-[12px] text-neutral-500">
          <kbd className="rounded border border-neutral-200 bg-white px-2 py-0.5 font-mono text-[11px]">
            {t("escCancel")}
          </kbd>
          <Link
            href={routes.clients}
            className="ml-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            {t("cancel")}
          </Link>
        </div>
      </div>
    </div>
  );
}

type Tone = "green" | "red";
function ChoiceCard({
  tone,
  tagLabel,
  tagSub,
  iconBg,
  icon,
  title,
  subtitle,
  rows,
  ctaLabel,
  ctaTone,
  href,
}: {
  tone: Tone;
  tagLabel: string;
  tagSub: string;
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  rows: { label: string; value: string; accent?: "primary" | "error" }[];
  ctaLabel: string;
  ctaTone: "primary" | "error";
  href: string;
}) {
  const ring =
    tone === "green"
      ? "border-primary-200 bg-tertiary-200"
      : "border-error-100 bg-error-50/40";
  const ctaCls =
    ctaTone === "primary"
      ? "bg-primary-500 hover:bg-primary-600"
      : "bg-error-500 hover:bg-error-700";
  const tagDot =
    tone === "green"
      ? "bg-primary-500"
      : "bg-error-500";
  const titleCls =
    tone === "green" ? "text-primary-700" : "text-error-700";

  return (
    <div className={`relative rounded-xl border-2 ${ring} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <span
          className={`grid h-12 w-12 place-items-center rounded-lg ${iconBg}`}
        >
          {icon}
        </span>
        <div className="text-right text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]">
            <span className={`h-1.5 w-1.5 rounded-full ${tagDot}`} />
            {tagLabel}
          </span>
          <div className="mt-0.5 text-[11px] text-neutral-600">{tagSub}</div>
        </div>
      </div>

      <h2 className={`text-[28px] font-bold ${titleCls}`}>{title}</h2>
      <p className="mb-4 text-[13px] text-neutral-600">{subtitle}</p>

      <dl className="mb-5 divide-y divide-neutral-100 overflow-hidden rounded-md border border-neutral-100 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
              {row.label}
            </dt>
            <dd
              className={`text-[12px] ${
                row.accent === "primary"
                  ? "font-semibold text-primary-700"
                  : row.accent === "error"
                    ? "font-semibold text-error-700"
                    : "text-neutral-700"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <Link
        href={href as Route}
        className={`flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-[13px] font-semibold text-white transition ${ctaCls}`}
      >
        {ctaLabel}
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
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
