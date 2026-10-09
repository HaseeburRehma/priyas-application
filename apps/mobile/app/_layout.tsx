/**
 * Root layout — mounted by expo-router at every route.
 *
 * Sets up:
 *   1. Query client (Tanstack)
 *   2. Auth provider (Supabase session)
 *   3. Locale bootstrap (SecureStore-persisted user pick if any)
 *   4. Splash screen visible until auth resolves
 *   5. Gate: authenticated with verified 2FA → (tabs); no session →
 *      /login; admin/dispatcher missing TOTP → /setup-2fa.
 */

import { useEffect, useState } from "react";
import { AppState, type AppStateStatus, View } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_400Regular_Italic } from "@expo-google-fonts/inter/400Regular_Italic";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { i18n, loadSavedLocale, onLocaleChange, saveLocale } from "@/lib/i18n";
import { bindOutboxAutoDrain } from "@/lib/outbox";
import { bindNotificationTapHandler, registerPushToken } from "@/lib/push";
import { colors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Wire React Query's focus manager to React Native's AppState so
// refetchOnWindowFocus actually fires on app-foreground, and background
// polling (like chat's 30s interval) pauses when the app is not visible.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    handleFocus(state === "active");
  });
  return () => sub.remove();
});

/**
 * Feature-update #16 · Offline-friendly schedule.
 *
 * Persisting react-query's cache to AsyncStorage means the app boots
 * with the last-seen schedule (and property picker, work-report
 * summary, etc.) even before the network comes back — the mutation
 * side of offline is handled by `src/lib/outbox.ts`.
 *
 * `gcTime` is bumped to 24h so cached entries survive across app
 * launches; without it react-query would garbage-collect anything not
 * currently rendered and the persister would then write an empty
 * cache to disk on the next flush.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "priyas.query-cache.v1",
  // Skip persisting anything transient — auth checks + push token
  // registrations refetch on every launch anyway.
  throttleTime: 2_000,
});

export default function RootLayout() {
  const [localeReady, setLocaleReady] = useState(false);
  // Re-mount the navigator when the user switches language in Settings
  // so every mounted screen re-renders with the new strings at once.
  const [localeKey, setLocaleKey] = useState(String(i18n.locale));
  useEffect(() => onLocaleChange((l) => setLocaleKey(l)), []);
  // Brand fonts (see `fonts` in lib/theme). The native splash stays up
  // until both fonts and locale are ready, so text never re-flows from
  // the system font. A load error falls back to system fonts.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    (async () => {
      const saved = await loadSavedLocale();
      if (saved) await saveLocale(saved);
      setLocaleReady(true);
    })();
  }, []);

  if (!localeReady || (!fontsLoaded && !fontError)) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            // Bump this when the persisted shape changes so old
            // devices don't hydrate a stale cache into a new schema.
            buster: "v1",
            // Only persist queries the app can safely reuse offline;
            // everything else is fetched fresh on next foreground.
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => {
                const k = query.queryKey?.[0];
                if (typeof k !== "string") return false;
                return (
                  k === "my-shifts" ||
                  k === "properties-picker" ||
                  k === "work-report" ||
                  k === "my-damage" ||
                  k === "clients-list"
                );
              },
            },
          }}
        >
          <AuthProvider>
            <AuthGate key={localeKey} />
            <StatusBar style="dark" />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Drives the navigation stack based on auth + 2FA state. Runs as a
 * child so it has access to the `useAuth()` context set up by
 * `<AuthProvider>` above.
 */
function AuthGate() {
  const { loading, session, needsTotpEnrolment } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Register the Expo push token as soon as we have a signed-in user.
  // Silent on Expo Go / simulators. `session?.user.id` in the deps
  // covers sign-in and sign-out; no stale-user risk on re-sign-in.
  useEffect(() => {
    if (!session?.user?.id) return;
    void registerPushToken(session.user.id);
  }, [session?.user?.id]);

  // Bind the tap-to-open handler once — the listener stays live for
  // the app's lifetime and self-unsubscribes on unmount.
  useEffect(() => bindNotificationTapHandler(router), [router]);

  // Drain the offline outbox on every app-foreground so queued
  // clock-ins / damage reports sync as soon as we're reachable again.
  useEffect(() => bindOutboxAutoDrain(), []);

  useEffect(() => {
    if (loading) return;
    void SplashScreen.hideAsync().catch(() => {});

    // Cast to string[] — expo-router's typed segments narrow to a
    // tuple of length 1 for the root, which makes index-into checks
    // fail typecheck even though the runtime is a plain string array.
    const segs = segments as string[];
    const inAuth = segs[0] === "(auth)";
    const on2FA = segs[1] === "setup-2fa";

    if (!session && !inAuth) {
      router.replace("/(auth)/login");
      return;
    }
    if (session && needsTotpEnrolment && !on2FA) {
      router.replace("/(auth)/setup-2fa");
      return;
    }
    if (session && !needsTotpEnrolment && inAuth) {
      router.replace("/(tabs)");
    }
  }, [loading, session, needsTotpEnrolment, segments, router]);

  if (loading) {
    // Keep the native splash visible until auth resolves — no flash of
    // a white React screen before the redirect fires.
    return <View style={{ flex: 1, backgroundColor: colors.tertiary[200] }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.tertiary[200] },
      }}
    />
  );
}
