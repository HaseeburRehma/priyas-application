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
 *
 * Performance: only the default locale (de) is statically imported and
 * transformed at module init. Other locales are lazy-loaded on demand
 * so we don't block the JS thread parsing ~10K lines of JSON at startup.
 */

import { I18n } from "i18n-js";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";

import de from "@/messages/de.json";

const SUPPORTED = ["de", "en", "ta"] as const;
export type Locale = (typeof SUPPORTED)[number];

const LOCALE_KEY = "priyas.locale";

/**
 * The message files ship with next-intl's `{name}` placeholder syntax
 * because they're literally copied from the web app. i18n-js expects
 * `%{name}` and displays anything else verbatim — which is why the
 * mobile UI was showing raw "{target}", "{n}", "{total}" etc. before
 * this shim landed.
 *
 * Rewrite `{ident}` → `%{ident}` recursively at import time so the
 * mobile app can read the same JSON without a build-step preprocess
 * (and without forking a mobile-only copy that drifts). Escape guard:
 * `{{name}}` (next-intl's literal-brace escape) becomes `{name}`, not
 * `%{name}`.
 */
function toI18nJs<T>(node: T): T {
  if (typeof node === "string") {
    // Protect literal `{{name}}` with control-character sentinels that
    // can never occur in real copy, swap remaining `{name}` for
    // `%{name}`, then restore the literals. (Using spaces as the
    // sentinel mangled every " word " in normal sentences.)
    return node
      .replace(/\{\{([\w.]+)\}\}/g, "\u0000$1\u0001")
      .replace(/\{([\w.]+)\}/g, "%{$1}")
      .replace(/\u0000([\w.]+)\u0001/g, "{$1}") as unknown as T;
  }
  if (Array.isArray(node)) return node.map(toI18nJs) as unknown as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = toI18nJs(v);
    return out as unknown as T;
  }
  return node;
}

// Only transform the default locale at startup; others are lazy-loaded.
export const i18n = new I18n({
  de: toI18nJs(de),
});

i18n.defaultLocale = "de";
i18n.enableFallback = true;
i18n.locale = pickDeviceLocale();

// Lazy-load non-default locales on first use
const localeLoaders: Record<string, () => Promise<Record<string, unknown>>> = {
  en: () => import("@/messages/en.json").then((m) => m.default),
  ta: () => import("@/messages/ta.json").then((m) => m.default),
};

async function ensureLocaleLoaded(locale: Locale): Promise<void> {
  if (locale === "de") return; // already loaded
  if (i18n.translations[locale]) return; // already loaded
  const loader = localeLoaders[locale];
  if (!loader) return;
  const messages = await loader();
  i18n.translations[locale] = toI18nJs(messages);
}

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
      const locale = raw as Locale;
      await ensureLocaleLoaded(locale);
      return locale;
    }
  } catch {
    // SecureStore can throw on emulators without a keychain; ignore.
  }
  // If device locale is non-default, ensure it's loaded
  const deviceLocale = pickDeviceLocale();
  if (deviceLocale !== "de") {
    await ensureLocaleLoaded(deviceLocale);
  }
  return null;
}

const localeListeners = new Set<(l: Locale) => void>();

/** Subscribe to locale switches (the root layout re-mounts the app). */
export function onLocaleChange(cb: (l: Locale) => void): () => void {
  localeListeners.add(cb);
  return () => {
    localeListeners.delete(cb);
  };
}

/** Persist a locale choice. Call this from the Settings screen. */
export async function saveLocale(l: Locale): Promise<void> {
  await ensureLocaleLoaded(l);
  const changed = i18n.locale !== l;
  i18n.locale = l;
  if (changed) localeListeners.forEach((cb) => cb(l));
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
