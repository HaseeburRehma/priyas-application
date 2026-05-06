"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { formatEUR } from "@/lib/utils/format";
import type { StatementData } from "@/lib/api/statement";

type Props = { data: StatementData };

const TABS = ["statement", "openBalance", "payments", "credits"] as const;

export function ClientStatement({ data }: Props) {
  const t = useTranslations("statement");
  const tTabs = useTranslations("statement.tabs");
  const tTable = useTranslations("statement.table");
  const tType = useTranslations("statement.type");
  const tSide = useTranslations("statement.side");
  const tSum = useTranslations("statement.summary");
  const tActions = useTranslations("statement.actions");
  const [tab, setTab] = useState<(typeof TABS)[number]>("statement");

  const filtered = useMemo(() => {
    switch (tab) {
      case "openBalance":
        return data.entries.filter(
          (e) => e.type === "invoice" && e.status !== "paid",
        );
      case "payments":
        return data.entries.filter((e) => e.type === "payment");
      case "credits":
        return data.entries.filter((e) => e.type === "credit");
      default:
        return data.entries;
    }
  }, [tab, data.entries]);

  // Running balance — descending in display, but compute ascending then mark.
  const withBalance = useMemo(() => {
    const ascending = [...filtered].reverse();
    let running = 0;
    const map = new Map<string, number>();
    for (const e of ascending) {
      running += e.debit_cents - e.credit_cents;
      map.set(e.id, running);
    }
    return filtered.map((e) => ({ ...e, balance: map.get(e.id) ?? 0 }));
  }, [filtered]);

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          Übersicht
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.clients} className="hover:text-neutral-700">
          {t("breadcrumbClients")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link
          href={routes.client(data.client.id)}
          className="hover:text-neutral-700"
        >
          {data.client.display_name}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">
            {data.client.display_name} · {t("subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button className="btn btn--ghost border border-neutral-200 bg-white">
            {tActions("sendReminder")}
          </button>
          <button className="btn btn--tertiary">
            {tActions("applyCredit")}
          </button>
          <button className="btn btn--primary">{tActions("exportPdf")}</button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={tSum("outstanding")}
          value={formatEUR(data.outstandingCents)}
          tone={data.outstandingCents > 0 ? "danger" : "muted"}
        />
        <SummaryCard
          label={tSum("paid")}
          value={formatEUR(data.paidYtdCents)}
          tone="up"
        />
        <SummaryCard
          label={tSum("credits")}
          value={formatEUR(data.creditsCents)}
        />
        <SummaryCard label={tSum("ytd")} value={formatEUR(data.ytdCents)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-neutral-100 px-2 py-1.5 text-[13px]">
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-md px-3 py-2",
                  tab === k ? "text-primary-700" : "text-neutral-600",
                )}
              >
                {tTabs(k)}
                {tab === k && (
                  <span className="absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-primary-500" />
                )}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>{tTable("date")}</Th>
                  <Th>{tTable("ref")}</Th>
                  <Th>{tTable("type")}</Th>
                  <Th>{tTable("description")}</Th>
                  <Th align="right">{tTable("debit")}</Th>
                  <Th align="right">{tTable("credit")}</Th>
                  <Th align="right">{tTable("balance")}</Th>
                </tr>
              </thead>
              <tbody>
                {withBalance.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-[13px] text-neutral-500">
                      {tTable("empty")}
                    </td>
                  </tr>
                )}
                {withBalance.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-100 last:border-b-0">
                    <td className="px-5 py-3 align-middle font-mono text-[12px] text-neutral-600">
                      {format(new Date(e.date), "yyyy-MM-dd")}
                    </td>
                    <td className="px-5 py-3 align-middle font-mono text-[12px] font-semibold text-secondary-500">
                      {e.ref}
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                          e.type === "invoice"
                            ? "bg-secondary-50 text-secondary-700"
                            : e.type === "payment"
                              ? "bg-success-50 text-success-700"
                              : "bg-warning-50 text-warning-700",
                        )}
                      >
                        {tType(e.type)}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-[13px] text-neutral-800">
                      {e.description}
                    </td>
                    <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-700">
                      {e.debit_cents ? formatEUR(e.debit_cents) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-success-700">
                      {e.credit_cents ? formatEUR(e.credit_cents) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right align-middle font-mono text-[13px] font-semibold text-secondary-500">
                      {formatEUR(e.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <h3 className="mb-3 text-[13px] font-semibold text-neutral-800">
              {tSide("agingTitle")}
            </h3>
            <ul className="space-y-2 text-[12px]">
              {[
                ["agingCurrent", data.aging.current_cents, "bg-success-500"],
                ["agingD30", data.aging.d1_30_cents, "bg-secondary-500"],
                ["agingD60", data.aging.d31_60_cents, "bg-warning-500"],
                ["agingD90", data.aging.d61_90_cents, "bg-warning-700"],
                ["agingD90plus", data.aging.d90plus_cents, "bg-error-500"],
              ].map(([key, cents, dot]) => (
                <li
                  key={key as string}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", dot as string)} />
                    <span className="text-neutral-700">
                      {tSide(key as never)}
                    </span>
                  </span>
                  <span className="font-mono text-neutral-800">
                    {formatEUR(cents as number)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <h3 className="mb-3 text-[13px] font-semibold text-neutral-800">
              {tSide("propertyTitle")}
            </h3>
            <ul className="space-y-1.5 text-[12px]">
              {data.byProperty.length === 0 && (
                <li className="text-neutral-500">—</li>
              )}
              {data.byProperty.map((p) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-neutral-700">{p.name}</span>
                  <span className="font-mono text-neutral-800">
                    {formatEUR(p.cents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <h3 className="mb-3 text-[13px] font-semibold text-neutral-800">
              {tSide("contactTitle")}
            </h3>
            <dl className="divide-y divide-neutral-100 text-[12px]">
              {data.client.email && (
                <Row label="Email" value={data.client.email} />
              )}
              {data.client.phone && (
                <Row label="Phone" value={data.client.phone} />
              )}
              <Row label={tSide("paymentTerms")} value="Net 14" />
              <Row label={tSide("paymentMethod")} value="SEPA" />
              <Row label={tSide("credit")} value="€10,000" />
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "up" | "danger" | "muted";
}) {
  const valColor =
    tone === "up"
      ? "text-success-700"
      : tone === "danger"
        ? "text-error-700"
        : "text-secondary-500";
  return (
    <div className="rounded-md border border-neutral-100 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className={`mt-1.5 text-[22px] font-bold tracking-[-0.01em] ${valColor}`}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-800">{value}</dd>
    </div>
  );
}
