/**
 * Keeps installed apps current, two ways:
 *
 * 1. Over-the-air (expo-updates). JS/asset changes published with
 *    `eas update --channel production` download in the background on
 *    launch and foreground. Once downloaded we ask before restarting —
 *    a silent reload could wipe a half-filled damage report — and
 *    "Later" still applies it on the next cold start.
 *    runtimeVersion uses the "appVersion" policy, so an update only
 *    reaches binaries with the same native version.
 *
 * 2. Store releases (native changes). The web app serves
 *    /mobile-version.json with a `minimum` per platform; below it the
 *    app shows a blocking "update required" prompt. For iOS the latest
 *    version comes from the public iTunes lookup, so we never nag
 *    before Apple has actually released it; Android uses `latest` from
 *    the JSON. A "new version" nudge is shown once per version.
 */

import { Alert, AppState, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { t } from "@/lib/i18n";

const IOS_APP_ID = "6807064077";
const ANDROID_PACKAGE = "de.priyas.mobile";
const STORE_URL = Platform.select({
  ios: `https://apps.apple.com/app/id${IOS_APP_ID}`,
  default: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
});
const NUDGED_KEY = "priyas.update-nudged";
const CHECK_EVERY_MS = 30 * 60 * 1000;

type PlatformVersions = { latest?: string; minimum?: string };
type VersionManifest = { ios?: PlatformVersions; android?: PlatformVersions };

/** Compare dotted versions numerically. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function webUrl(): string | null {
  const u =
    process.env.EXPO_PUBLIC_WEB_URL ||
    (Constants.expoConfig?.extra?.webUrl as string | undefined);
  return u ? u.replace(/\/+$/, "") : null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function latestIosVersion(): Promise<string | null> {
  const data = await fetchJson<{ results?: { version?: string }[] }>(
    `https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=de&t=${Date.now()}`,
  );
  return data?.results?.[0]?.version ?? null;
}

let promptOpen = false;
let requiredVersion: string | null = null;

function openStore() {
  void Linking.openURL(STORE_URL).catch(() => {});
}

function showRequired(version: string) {
  requiredVersion = version;
  if (promptOpen) return;
  promptOpen = true;
  Alert.alert(
    t("mobile.ui.update.requiredTitle"),
    t("mobile.ui.update.requiredBody", { version }),
    [
      {
        text: t("mobile.ui.update.update"),
        onPress: () => {
          promptOpen = false;
          openStore();
        },
      },
    ],
    { cancelable: false },
  );
}

async function showNudgeOnce(version: string) {
  if (promptOpen) return;
  const already = await SecureStore.getItemAsync(NUDGED_KEY).catch(() => null);
  if (already === version) return;
  await SecureStore.setItemAsync(NUDGED_KEY, version).catch(() => {});
  promptOpen = true;
  Alert.alert(
    t("mobile.ui.update.storeTitle"),
    t("mobile.ui.update.storeBody", { version }),
    [
      { text: t("mobile.ui.update.later"), style: "cancel", onPress: () => (promptOpen = false) },
      {
        text: t("mobile.ui.update.update"),
        onPress: () => {
          promptOpen = false;
          openStore();
        },
      },
    ],
    { onDismiss: () => (promptOpen = false) },
  );
}

export async function checkStoreVersion(): Promise<void> {
  if (Platform.OS === "web") return;
  const installed = Application.nativeApplicationVersion;
  if (!installed) return;

  const base = webUrl();
  const manifest = base
    ? await fetchJson<VersionManifest>(`${base}/mobile-version.json?t=${Date.now()}`)
    : null;
  const own = Platform.OS === "ios" ? manifest?.ios : manifest?.android;

  if (own?.minimum && compareVersions(installed, own.minimum) < 0) {
    showRequired(own.minimum);
    return;
  }

  const latest = Platform.OS === "ios" ? await latestIosVersion() : own?.latest;
  if (latest && compareVersions(installed, latest) < 0) {
    await showNudgeOnce(latest);
  }
}

let otaBusy = false;
let otaReady = false;

export async function checkOtaUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || otaBusy) return;
  otaBusy = true;
  try {
    if (!otaReady) {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew) return;
      otaReady = true;
    }
    if (promptOpen) return;
    promptOpen = true;
    Alert.alert(t("mobile.ui.update.otaTitle"), t("mobile.ui.update.otaBody"), [
      { text: t("mobile.ui.update.later"), style: "cancel", onPress: () => (promptOpen = false) },
      {
        text: t("mobile.ui.update.restart"),
        onPress: () => {
          promptOpen = false;
          void Updates.reloadAsync().catch(() => {});
        },
      },
    ]);
  } catch {
    // Offline or update server unreachable — try again next foreground.
  } finally {
    otaBusy = false;
  }
}

/**
 * Run both checks on launch and whenever the app returns to the
 * foreground (at most every 30 min, except when a store update is
 * required — that re-prompts every foreground). Returns an unsubscribe.
 */
export function bindAppUpdateChecks(): () => void {
  let last = 0;
  const run = () => {
    last = Date.now();
    void checkOtaUpdate();
    void checkStoreVersion();
  };
  run();
  const sub = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    if (requiredVersion) showRequired(requiredVersion);
    if (Date.now() - last > CHECK_EVERY_MS) run();
  });
  return () => sub.remove();
}
