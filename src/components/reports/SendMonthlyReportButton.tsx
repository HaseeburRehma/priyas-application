"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  sendMonthlyReportToManagementAction,
  resendMonthlyReportAction,
} from "@/app/actions/monthly-report";

/**
 * Tiny client island for the "Send to management" button on the
 * Alltagshilfe report page. Two modes:
 *  - mode="send" → first-time send for a period that's never been emailed.
 *  - mode="resend" → re-fire after an existing delivery; demotes the
 *    previous 'sent' row server-side so the unique index allows another
 *    row to take its place.
 *
 * Wraps both calls in useTransition so the button stays interactive
 * (disabled + spinner-style label) while the network round-trip
 * happens. revalidatePath on the action refreshes the delivery panel
 * automatically; router.refresh() backs that up when the action
 * doesn't run inside a fresh request context (e.g. local dev hot
 * reload swallowing the revalidate).
 */
export function SendMonthlyReportButton({
  year,
  month,
  mode,
  variant = "primary",
  label,
  className,
}: {
  year: number;
  month: number;
  mode: "send" | "resend";
  variant?: "primary" | "ghost";
  label: string;
  className?: string;
}) {
  const t = useTranslations("alltagshilfeReport");
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = () => {
    start(async () => {
      const fn =
        mode === "resend"
          ? resendMonthlyReportAction
          : sendMonthlyReportToManagementAction;
      const res = await fn({ year, month });
      if (res.ok) {
        toast.success(t("toastSendOk", { recipient: res.recipient }));
        router.refresh();
      } else {
        toast.error(t("toastSendFail", { error: res.error }));
      }
    });
  };

  const base =
    variant === "primary"
      ? "btn btn--danger"
      : "btn btn--ghost border border-neutral-200 bg-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={[base, pending && "cursor-wait opacity-70", className]
        .filter(Boolean)
        .join(" ")}
    >
      {pending ? t("actionSendingShort") : label}
    </button>
  );
}
