import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/Logo";

/**
 * Left-hand brand panel shared by /login and /register. Pure presentation;
 * faithfully reproduces 01-login.html.
 */
export function AuthBrandPanel() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  return (
    <aside
      className="relative hidden flex-col justify-between overflow-hidden p-12 text-white md:flex"
      style={{
        background:
          "linear-gradient(140deg, var(--secondary-700) 0%, var(--secondary-500) 55%, var(--primary-700) 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 85% 20%, rgba(168,204,135,.25), transparent 45%)," +
            "radial-gradient(circle at 15% 85%, rgba(114,169,79,.28), transparent 50%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[120px] -left-[120px] h-[420px] w-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 border-b border-white/[.06] pb-6">
        {/* The source PNG is 110 × 44 native. Anything past `xl`
         *  (56 px tall ≈ 1.3× the native height) starts to look blurry
         *  because we're upscaling a raster image. The wordmark
         *  already carries the brand name + the "Leistung mit Herz"
         *  tagline, so no separate subtitle is needed. */}
        <Logo size="xl" variant="light" />
      </div>

      <div className="relative z-10 max-w-[460px]">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent-300">
          {t("heroEyebrow")}
        </div>
        <h1 className="mb-5 text-[44px] font-extrabold leading-[1.08] tracking-tightest">
          {t("heroTitle")}
        </h1>
        <p className="max-w-[420px] text-[16px] leading-[1.55] text-white/75">
          {t("heroBody")}
        </p>

        <ul className="mt-8 flex max-w-[420px] flex-col gap-3.5">
          {(
            [
              ["feature1Title", "feature1Body"],
              ["feature2Title", "feature2Body"],
              ["feature3Title", "feature3Body"],
            ] as const
          ).map(([titleKey, bodyKey]) => (
            <li
              key={titleKey}
              className="flex items-start gap-3 text-[13px] text-white/85"
            >
              <span className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full bg-accent-500/20 text-accent-300">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[13px] w-[13px]"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span>
                <strong className="block text-white">{t(titleKey)}</strong>
                {t(bodyKey)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 flex items-center justify-between text-[12px] text-white/55">
        <div>{t("brandCopyright")}</div>
        <div className="space-x-1">
          <button type="button" className="hover:text-white" aria-disabled="true" title={tCommon("comingSoon")}>{t("brandFooterPrivacy")}</button>
          <span>·</span>
          <button type="button" className="hover:text-white" aria-disabled="true" title={tCommon("comingSoon")}>{t("brandFooterTerms")}</button>
          <span>·</span>
          <button type="button" className="hover:text-white" aria-disabled="true" title={tCommon("comingSoon")}>{t("brandFooterSupport")}</button>
        </div>
      </div>
    </aside>
  );
}
