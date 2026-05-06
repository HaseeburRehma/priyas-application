"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deletePropertyAction } from "@/app/actions/properties";
import { routes } from "@/lib/constants/routes";

export function PropertyDetailActions({
  id,
  canUpdate,
  canDelete,
}: {
  id: string;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("properties.detail");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    start(async () => {
      const r = await deletePropertyAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("deleteSuccess"));
      setOpen(false);
      router.replace(routes.properties);
      router.refresh();
    });
  }

  return (
    <div className="ml-auto flex flex-shrink-0 items-center gap-2">
      <Link
        href={routes.chat}
        title={t("openMessage")}
        className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
        </svg>
      </Link>
      <Link
        href={routes.schedule}
        title={t("openSchedule")}
        className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <rect x={3} y={5} width={18} height={16} rx={2} />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      </Link>
      {canUpdate && (
        <Link href={routes.propertyEdit(id)} className="btn btn--tertiary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {t("edit")}
        </Link>
      )}
      {canUpdate && (
        <button type="button" className="btn btn--primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("addArea")}
        </button>
      )}
      {canDelete && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
            aria-label={t("moreActions")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx={12} cy={5} r={1} />
              <circle cx={12} cy={12} r={1} />
              <circle cx={12} cy={19} r={1} />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-11 z-30 w-[200px] overflow-hidden rounded-md border border-neutral-100 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="block w-full px-4 py-2 text-left text-[13px] text-error-700 transition hover:bg-error-50"
              >
                {t("delete")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
