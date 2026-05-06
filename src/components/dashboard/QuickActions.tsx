"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";

export function QuickActions() {
  const t = useTranslations("dashboard.quickActions");

  const items = [
    {
      href: routes.clientNew,
      title: t("addClient"),
      sub: t("addClientSub"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: routes.schedule,
      title: t("planShift"),
      sub: t("planShiftSub"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x={3} y={5} width={18} height={16} rx={2} />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      ),
    },
    {
      href: routes.invoices,
      title: t("generateInvoice"),
      sub: t("generateInvoiceSub"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      ),
    },
    {
      href: routes.reports,
      title: t("exportReport"),
      sub: t("exportReportSub"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
        </svg>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("title")}
        </h3>
        <div className="mt-0.5 text-[12px] text-neutral-500">
          {t("subtitle")}
        </div>
      </header>
      <div className="grid grid-cols-2 gap-2.5 p-5">
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="flex items-center gap-2.5 rounded-md border border-neutral-100 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-primary-300 hover:bg-tertiary-200"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-primary-50 text-primary-600 [&_svg]:h-4 [&_svg]:w-4">
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-neutral-700">
                {item.title}
              </span>
              <span className="mt-px block truncate text-[10px] text-neutral-400">
                {item.sub}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
