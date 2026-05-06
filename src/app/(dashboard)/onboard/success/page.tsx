import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Onboarding abgeschlossen" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("onboarding.success");
  return (
    <div className="mx-auto grid max-w-[640px] place-items-center py-12 text-center">
      <div className="rounded-xl border border-success-300 bg-white p-10 shadow-sm">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-success-50 text-[28px] text-success-700">
          ✓
        </div>
        <h1 className="mb-2 text-[24px] font-bold text-secondary-500">
          {t("title")}
        </h1>
        <p className="mb-7 text-[14px] leading-[1.55] text-neutral-600">
          {t("body")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={routes.onboard}
            className="btn btn--primary"
            style={{ minHeight: 48, padding: "12px 20px" }}
          >
            {t("another")}
          </Link>
          <Link
            href={routes.clients}
            className="btn btn--ghost border border-neutral-200 bg-white"
            style={{ minHeight: 48, padding: "12px 20px" }}
          >
            {t("toClients")}
          </Link>
        </div>
      </div>
    </div>
  );
}
