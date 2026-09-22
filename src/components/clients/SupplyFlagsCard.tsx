"use client";

/**
 * Feature-update #18 (web PM view) · Cleaning-supply flags card.
 *
 * Renders the customer's last N supply-flag events on their detail
 * page so the project manager sees at a glance:
 *   * Whether the most recent visit found supplies present or missing
 *   * Which items the staff flagged for next time (the note)
 *   * A one-click "Erledigt" button to mark a missing-supply flag
 *     resolved
 *
 * Field staff write these from the mobile app (SupplyCheck screen —
 * shipping in a later mobile-side commit); the DB table lives in
 * public.supply_flags via migration 20260921_000062.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SupplyFlag } from "@/lib/api/supply-flags";
import { resolveSupplyFlagAction } from "@/app/actions/supply-flags";
import { cn } from "@/lib/utils/cn";

type Props = {
  clientId: string;
  flags: SupplyFlag[];
  canResolve: boolean;
};

export function SupplyFlagsCard({ clientId, flags, canResolve }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function resolve(flagId: string) {
    setBusyId(flagId);
    start(async () => {
      const res = await resolveSupplyFlagAction(flagId, clientId);
      if (!res.ok) {
        toast.error(res.error);
        setBusyId(null);
        return;
      }
      toast.success("Flag als erledigt markiert");
      router.refresh();
      setBusyId(null);
    });
  }

  // Empty state — encourages the client to enable mobile supply
  // checks; skips rendering a lonely empty card if the field staff
  // haven't started reporting yet.
  const latest = flags[0] ?? null;
  const unresolvedMissing = flags.filter((f) => !f.resolved && !f.supplies_ok);

  return (
    <section className="mt-5 rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-secondary-500">
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
              <path d="M9 3h6l-1 5h4l-4 6 1 7-9-6 1-7L2 8h4z" />
            </svg>
            Reinigungsmittel
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            Statusmeldungen der Reinigungskräfte (mobile App)
          </div>
        </div>
        {latest && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              latest.supplies_ok
                ? "bg-primary-50 text-primary-700"
                : "bg-error-50 text-error-700",
            )}
            title={`Zuletzt gemeldet am ${new Date(latest.reported_at).toLocaleString("de-DE")}`}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                latest.supplies_ok ? "bg-primary-500" : "bg-error-500",
              )}
            />
            {latest.supplies_ok
              ? "Zuletzt: vorhanden"
              : `Fehlt${
                  unresolvedMissing.length > 1
                    ? ` (${unresolvedMissing.length} offen)`
                    : ""
                }`}
          </span>
        )}
      </header>

      {flags.length === 0 ? (
        <p className="p-5 text-[13px] italic text-neutral-500">
          Noch keine Meldungen — Reinigungskräfte können nach jedem
          Einsatz per mobiler App markieren, ob Reinigungsmittel
          vorhanden sind.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {flags.map((f) => (
            <li
              key={f.id}
              className={cn(
                "flex items-start gap-3 p-4",
                !f.supplies_ok && !f.resolved && "bg-error-50/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full",
                  f.supplies_ok
                    ? "bg-primary-100 text-primary-700"
                    : f.resolved
                      ? "bg-neutral-100 text-neutral-500"
                      : "bg-error-100 text-error-700",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  {f.supplies_ok ? (
                    <path d="M5 13l4 4L19 7" />
                  ) : (
                    <path d="M18 6L6 18M6 6l12 12" />
                  )}
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold text-neutral-800">
                    {f.supplies_ok ? "Vorhanden" : "Fehlt"}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {new Date(f.reported_at).toLocaleString("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {f.reported_by_name ? ` · ${f.reported_by_name}` : ""}
                  </span>
                  {f.resolved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                      Erledigt
                      {f.resolved_by_name ? ` · ${f.resolved_by_name}` : ""}
                    </span>
                  )}
                </div>
                {f.note && (
                  <p className="mt-1 whitespace-pre-wrap text-[12px] text-neutral-700">
                    {f.note}
                  </p>
                )}
              </div>
              {canResolve && !f.resolved && !f.supplies_ok && (
                <button
                  type="button"
                  onClick={() => resolve(f.id)}
                  disabled={pending && busyId === f.id}
                  className={cn(
                    "shrink-0 rounded-md border border-neutral-200 bg-white px-2.5 py-1",
                    "text-[12px] font-medium text-neutral-700 shadow-xs transition hover:bg-neutral-50",
                    "disabled:opacity-60",
                  )}
                >
                  {pending && busyId === f.id ? "…" : "Erledigt"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
