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
import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { loadSavedLocale, saveLocale } from "@/lib/i18n";
import { colors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [localeReady, setLocaleReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await loadSavedLocale();
      if (saved) await saveLocale(saved);
      setLocaleReady(true);
    })();
  }, []);

  if (!localeReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGate />
            <StatusBar style="dark" />
          </AuthProvider>
        </QueryClientProvider>
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
