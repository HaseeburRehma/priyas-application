import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "E-Mail bestätigen" };

/**
 * Post-signup landing page. Tells the user to click the verification link
 * in their inbox. We don't show their email here on purpose — keeps URL/UX
 * simple and avoids leaking email through history.
 */
export default async function CheckEmailPage() {
  const t = await getTranslations("auth");
  return (
    <main className="grid min-h-screen place-items-center bg-tertiary-200 px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-700">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
            <path d="M22 6l-10 7L2 6" />
          </svg>
        </div>
        <h1 className="mb-2 text-[22px] font-bold text-secondary-500">
          {t("checkEmailTitle")}
        </h1>
        <p className="mb-6 text-[14px] leading-[1.55] text-neutral-600">
          {t("checkEmailBody")}
        </p>
        <Link
          href={routes.login}
          className="btn btn--tertiary w-full"
          style={{ minHeight: 48 }}
        >
          ← {t("signInLink")}
        </Link>
      </div>
    </main>
  );
}
