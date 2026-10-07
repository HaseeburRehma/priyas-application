"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { formatEUR } from "@/lib/billing/money";
import { daysUntil } from "@/lib/billing/contract";
import type { ContractReminder } from "@/lib/api/client-hours";

/**
 * Fixed contracts ending within 30 days (or already ended). Nothing is
 * renewed or stopped automatically — each row links to the client's edit
 * form, where the admin extends the term or switches to hourly billing.
 */
export function ContractReminders({ items }: { items: ContractReminder[] }) {
  const t = useTranslations("dashboard.contracts");
  if (items.length === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-warning-500 bg-warning-50 p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-neutral-800">
          {t("title", { count: items.length })}
        </h2>
        <p className="text-xs text-neutral-600">{t("subtitle")}</p>
      </header>
      <ul className="divide-y divide-neutral-200">
        {items.map((c) => {
          const days = daysUntil(c.contractEnd);
          const [y, m, d] = c.contractEnd.split("-");
          return (
            <li
              key={c.clientId}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={routes.client(c.clientId)}
                  className="font-medium text-neutral-800 hover:underline"
                >
                  {c.displayName}
                </Link>
                <span className="ml-2 text-xs text-neutral-500">
                  {t("endsOn", { date: `${d}.${m}.${y}` })}
                  {c.fixedMonthlyFeeCents != null &&
                    ` · ${t("fee", { fee: formatEUR(c.fixedMonthlyFeeCents) })}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    days < 0 ? "bg-error-50 text-error-700" : "bg-white text-warning-700",
                  )}
                >
                  {days < 0
                    ? t("expiredAgo", { days: -days })
                    : days === 0
                      ? t("endsToday")
                      : t("endsIn", { days })}
                </span>
                <Link
                  href={routes.clientEdit(c.clientId)}
                  className="text-xs font-medium text-primary-700 hover:underline"
                >
                  {t("decide")}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
