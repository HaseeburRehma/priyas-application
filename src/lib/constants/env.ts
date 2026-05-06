import { z } from "zod";


const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["de", "en", "ta"]).default("de"),
  /**
   * UUID of the organization that self-serve signups join. Defaults to the
   * seeded "Priya's Reinigungsservice" org (see supabase/seed/seed.sql).
   * Override per-environment if you ever run multi-tenant.
   */
  NEXT_PUBLIC_DEFAULT_ORG_ID: z
    .string()
    .uuid()
    .default("00000000-0000-0000-0000-0000000000aa"),
  NEXT_PUBLIC_FEATURE_LEXWARE_SYNC: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_FEATURE_WHATSAPP_NOTIFICATIONS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_FEATURE_REALTIME_CHAT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /**
   * VAPID public key — exposed to the browser to register push
   * subscriptions. Generate via `npx web-push generate-vapid-keys` and
   * keep the matching private key in `WEB_PUSH_PRIVATE_KEY` (server-only).
   */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().default(""),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  NEXT_PUBLIC_DEFAULT_ORG_ID: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID,
  NEXT_PUBLIC_FEATURE_LEXWARE_SYNC: process.env.NEXT_PUBLIC_FEATURE_LEXWARE_SYNC,
  NEXT_PUBLIC_FEATURE_WHATSAPP_NOTIFICATIONS:
    process.env.NEXT_PUBLIC_FEATURE_WHATSAPP_NOTIFICATIONS,
  NEXT_PUBLIC_FEATURE_REALTIME_CHAT:
    process.env.NEXT_PUBLIC_FEATURE_REALTIME_CHAT,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
});

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const summary = Object.entries(fieldErrors)
    .map(([key, errs]) => `  • ${key}: ${(errs ?? []).join(", ")}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(
    "\n❌ Invalid environment variables. Fix your .env.local:\n" + summary + "\n",
  );
  throw new Error(
    `Invalid environment variables. Missing or invalid:\n${summary}\n\n` +
    `Copy .env.example → .env.local and fill in the values, then restart the dev server.`,
  );
}

export const env = parsed.data;
