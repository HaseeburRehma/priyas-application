"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";
import { ImportDialog } from "@/components/shared/ImportDialog";

type Props = { canCreate: boolean };

export function PropertiesPageHead({ canCreate }: Props) {
  const t = useTranslations("properties");
  const tCommon = useTranslations("common");
  const [importOpen, setImportOpen] = useState(false);
  const comingSoonTitle = tCommon("comingSoon");

  return (
    <div className="mb-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbProperties")}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn btn--ghost border border-neutral-200 bg-white"
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
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
            </svg>
            {t("actions.import")}
          </button>
          <ImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            endpoint="/api/properties/import"
            templateUrl="/api/properties/import"
            moduleName="properties"
          />
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={comingSoonTitle}
            className="btn btn--tertiary cursor-not-allowed opacity-50"
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
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
            </svg>
            {t("actions.export")}
          </button>
          {canCreate && (
            <Link href={routes.propertyNew} className="btn btn--primary">
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
              {t("actions.new")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
