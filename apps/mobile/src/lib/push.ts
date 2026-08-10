/**
 * Push-notification registration + tap-to-open router.
 *
 * On sign-in:
 *   1. Ask iOS/Android for permission (only prompts once — subsequent
 *      calls read the persisted answer).
 *   2. Fetch the Expo push token from Expo's backend using the EAS
 *      projectId from app.json.
 *   3. Upsert a row in `user_devices` for this user × device so the
 *      Web app's push-fan-out can target it.
 *
 * On foreground notification: shown as a system banner (default).
 * On tap: route to the deep link carried in `data.url` — the same
 * scheme the Web app uses ("/schedule/<id>", "/damage/<id>", etc.).
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { Router } from "expo-router";
import { getSupabase } from "@/lib/supabase";

// Show banners while the app is in the foreground — matches what the
// user expects on the web side (a toast pop-in).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    // These are only read on iOS 14+ — kept for forward-compat.
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const FINGERPRINT_KEY = "priyas.device.fingerprint";

/**
 * Stable-per-install fingerprint. Not a hardware ID — a random string
 * generated on first launch and persisted to SecureStore. Combined
 * with `user_id` on the row so the same physical device shows one
 * row per signed-in user, not one per install.
 */
async function getDeviceFingerprint(): Promise<string> {
  let fp = await SecureStore.getItemAsync(FINGERPRINT_KEY);
  if (fp) return fp;
  fp = `m-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await SecureStore.setItemAsync(FINGERPRINT_KEY, fp);
  return fp;
}

/**
 * Register this device with Expo + upsert into `user_devices`.
 * Silently no-ops on Expo Go without a projectId or when permission
 * is denied — those aren't errors worth interrupting the user for.
 */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    // Push tokens don't work in the Expo Go client past SDK 53 for iOS;
    // this is expected. We still register on Android Go (which does
    // work) and on real / TestFlight builds.
    if (!Constants.isDevice && Platform.OS !== "web") {
      // Simulators — Apple will refuse a token; Android emulators can
      // register but the token is worthless. Skip either way.
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } })
        .easConfig?.projectId;
    if (!projectId) {
      // EAS isn't configured yet — dev-only case. Nothing to register.
      return;
    }

    // Ask (or read the previously-granted answer).
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return;

    // Android needs an explicit channel with importance HIGH before
    // any notification can render — otherwise it silently drops.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Priya's",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#72A94F",
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token?.data) return;

    const fingerprint = await getDeviceFingerprint();

    const supabase = getSupabase();
    // Best-effort upsert — never throws, so a network hiccup here can't
    // block the sign-in flow.
    await supabase
      .from("user_devices")
      .upsert(
        {
          user_id: userId,
          fingerprint,
          device_label:
            Platform.OS === "ios"
              ? `iOS · Priya app`
              : Platform.OS === "android"
                ? `Android · Priya app`
                : "Mobile",
          device_kind: "mobile",
          os: `${Platform.OS} ${Platform.Version}`,
          browser: null,
          expo_push_token: token.data,
          platform: (Platform.OS === "ios" || Platform.OS === "android"
            ? Platform.OS
            : "web") as "ios" | "android" | "web",
          app_version: Constants.expoConfig?.version ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,fingerprint" },
      );
  } catch {
    // Push registration is a nice-to-have. Never let it break sign-in.
  }
}

/**
 * Wire the tap-to-open handler. Reads `data.url` off the incoming
 * notification and asks expo-router to navigate there — this is the
 * same convention the Web app already emits.
 */
export function bindNotificationTapHandler(router: Router): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const url = (response.notification.request.content.data as
        | { url?: string }
        | undefined)?.url;
      if (typeof url === "string" && url.length > 0) {
        // Router accepts app-relative paths like "/schedule/abc" or
        // "/damage" — the same paths the Web app uses. If the URL is a
        // full `priyas://` deep link, expo-linking parses it on our
        // behalf via the root scheme in app.json.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push(url as any);
        } catch {
          // Malformed — swallow. Better than a crash on a bad payload.
        }
      }
    },
  );
  return () => sub.remove();
}
