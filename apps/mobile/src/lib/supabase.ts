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
 * Read Supabase creds from three sources, in preference order, treating
 * empty strings the same as `undefined` so a blank env fallthrough
 * doesn't poison the client:
 *
 *   1. `process.env.EXPO_PUBLIC_*` — literalized by Metro at bundle time
 *      when set in `eas.json`'s `build.<profile>.env`. Most reliable for
 *      production builds; no runtime manifest dependency.
 *   2. `Constants.expoConfig?.extra?.*` — from the embedded app.json
 *      manifest. Works in dev; in SDK 57 standalone builds the embedded
 *      manifest occasionally doesn't carry through user-defined `extra`
 *      values, which is why we no longer rely on it as the primary path.
 *   3. Missing → throw at startup so we fail loud rather than emit
 *      opaque "No API key found in request" errors later.
 *
 * Coalesce with a helper because `??` alone would happily return `""`
 * from the LHS, which then reaches `createClient(url, "")` and produces
 * exactly the empty-apikey behaviour we saw in TestFlight build 16.
 */
const nonEmpty = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

function readConfig(): { url: string; anonKey: string } {
  const url =
    nonEmpty(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    nonEmpty(Constants.expoConfig?.extra?.supabaseUrl);
  const anonKey =
    nonEmpty(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    nonEmpty(Constants.expoConfig?.extra?.supabaseAnonKey);
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env or eas.json build.env.",
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
