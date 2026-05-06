"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";

type Props = {
  greetingName: string;
};

const localeToBcp = (l: string) =>
  l === "ta" ? "ta-IN" : l === "en" ? "en-GB" : "de-DE";

function germanGreetingKey(d: Date): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/**
 * Top of the dashboard page: greeting + date chip + Export + New customer.
 *
 * The greeting and date strings are time/locale-dependent, which makes
 * them hostile to SSR — the server's clock + timezone don't match the
 * client's, so first-render HTML diverges and React throws a hydration
 * error. We render placeholders for the very first paint, then fill the
 * real values in via useEffect after mount. The user sees the dashboard
 * skeleton instantly, the greeting + date snap in a frame later.
 */
export function PageHead({ greetingName }: Props) {
  const t = useTranslations("dashboard");
  const tg = useTranslations("greeting");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [dateLabel, setDateLabel] = useState<string>("");
  const [greeting, setGreeting] = useState<string>("");

  useEffect(() => {
    const now = new Date();
    setDateLabel(
      new Intl.DateTimeFormat(localeToBcp(locale), {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now),
    );
    setGreeting(tg(germanGreetingKey(now)));
  }, [locale, tg]);

  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
          {greeting ? `${greeting}, ` : ""}
          {greetingName}{" "}
          <span aria-hidden role="img">
            👋
          </span>
        </h1>
        <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-100 bg-white px-3.5 py-2 text-[12px] text-neutral-600">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 text-primary-500"
          >
            <rect x={3} y={5} width={18} height={16} rx={2} />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </svg>
          {dateLabel || " "}
        </span>

        <button type="button" className="btn btn--tertiary">
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
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
          </svg>
          {tCommon("export")}
        </button>

        <Link href={routes.clientNew} className="btn btn--primary">
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
          {t("newCustomer")}
        </Link>
      </div>
    </div>
  );
}
