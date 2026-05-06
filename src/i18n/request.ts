import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["de", "en", "ta"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  const locale: Locale = (
    SUPPORTED_LOCALES as ReadonlyArray<string>
  ).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : "de";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Berlin",
  };
});
