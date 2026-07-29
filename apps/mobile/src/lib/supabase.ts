/**
 * Supabase client for React Native.
 *
 * Session persistence uses `expo-secure-store` (Keychain on iOS,
 * EncryptedSharedPreferences on Android) instead of AsyncStorage —
 * refresh tokens are bearer credentials and should not sit in
 * plaintext.
 *
 * `detectSessionInUrl: false` because RN has no URL to parse; sessions
 * are refreshed via the SDK's own timer.
 */

import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

/**
 * Read from Expo's public env (`EXPO_PUBLIC_*` variables are available
 * on both the client and the native runtime). Falling back to `extra`
 * so `eas build` can inject values without a rebuild of source.
 */
function readConfig(): { url: string; anonKey: string } {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    (Constants.expoConfig?.extra?.supabaseUrl as string | undefined);
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined);
  if (!url || !anonKey) {
    // Deliberately loud — a missing Supabase URL means every network
    // call would fail with an opaque error later. Better to fail fast
    // at startup.
    throw new Error(
      "Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env before running.",
    );
  }
  return { url, anonKey };
}

/**
 * SecureStore adapter shaped to Supabase's `Storage` interface.
 * Keys are prefixed to avoid collisions with other libraries writing
 * to the same keychain group.
 */
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(`sb.${key}`),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(`sb.${key}`, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(`sb.${key}`),
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, anonKey } = readConfig();
  client = createClient(url, anonKey, {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
