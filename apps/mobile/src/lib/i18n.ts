/**
 * i18n runtime — powered by `i18n-js` + `expo-localization`.
 *
 * Locale resolution order:
 *   1. Value the user picked in Settings → My Account (persisted in
 *      SecureStore, key = "priyas.locale").
 *   2. Device locale via `getLocales()[0].languageCode`.
 *   3. Fallback to German (matches the primary customer language).
 *
 * The locale JSON files are literally copied from the web app's
 * `messages/*.json` so translation keys stay identical. See
 * `apps/mobile/src/messages/README-copy.md` for the sync command.
 */

import { I18n } from "i18n-js";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";

import de from "@/messages/de.json";
import en from "@/messages/en.json";
import ta from "@/messages/ta.json";

const SUPPORTED = ["de", "en", "ta"] as const;
export type Locale = (typeof SUPPORTED)[number];

const LOCALE_KEY = "priyas.locale";

export const i18n = new I18n({
  de,
  en,
  ta,
});

i18n.defaultLocale = "de";
i18n.enableFallback = true;
i18n.locale = pickDeviceLocale();

function pickDeviceLocale(): Locale {
  // `getLocales()` returns the OS preference list. First supported
  // match wins so a user with [ta, en, de] gets Tamil, not German.
  for (const l of getLocales()) {
    const code = l.languageCode?.toLowerCase();
    if (code && (SUPPORTED as readonly string[]).includes(code)) {
      return code as Locale;
    }
  }
  return "de";
}

/** Read the user's saved locale (if any). Awaits SecureStore. */
export async function loadSavedLocale(): Promise<Locale | null> {
  try {
    const raw = await SecureStore.getItemAsync(LOCALE_KEY);
    if (raw && (SUPPORTED as readonly string[]).includes(raw)) {
      return raw as Locale;
    }
  } catch {
    // SecureStore can throw on emulators without a keychain; ignore.
  }
  return null;
}

/** Persist a locale choice. Call this from the Settings screen. */
export async function saveLocale(l: Locale): Promise<void> {
  i18n.locale = l;
  try {
    await SecureStore.setItemAsync(LOCALE_KEY, l);
  } catch {
    // Silent — the in-memory locale switch already worked.
  }
}

/** Convenience wrapper for components that don't want to import `i18n`
 *  directly. Mirrors the shape of next-intl's `t()`. */
export function t(
  key: string,
  values?: Record<string, string | number>,
): string {
  return i18n.t(key, values);
}
