import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

// Playwright runs in its own process and does NOT inherit Next.js's
// .env.local loading. Pull it in here so ANTHROPIC_API_KEY (Stagehand)
// and the Supabase keys (auth in tests) are visible.
loadDotenv({ path: resolve(__dirname, ".env.local") });
loadDotenv({ path: resolve(__dirname, ".env"), override: false });

/**
 * Playwright config — runs against the local Next dev server.
 *
 * Two projects:
 *   • chromium  — deterministic specs in tests/e2e/*.spec.ts (fast, free).
 *   • stagehand — AI-driven specs in tests/e2e/stagehand/*.spec.ts.
 *                 Needs ANTHROPIC_API_KEY (or OPENAI_API_KEY).
 *
 * Setup:
 *   1. Apply migrations + seed.sql + test_users.sql.
 *   2. Configure .env.local (Supabase keys + ANTHROPIC_API_KEY for Stagehand).
 *   3. `npm run dev` (or let webServer below boot it).
 *   4. `npm run test:e2e`            → deterministic only.
 *      `npm run test:stagehand`      → Stagehand only.
 *      `npm run test:stagehand:ui`   → interactive inspector.
 *
 * Set REUSE_DEV_SERVER=1 to skip webServer when you already have one running.
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
  },

  /**
   * Browser matrix per spec §8 (Chrome 90+, Safari 15+, Firefox 90+, Edge 90+).
   *
   * Run all three: `npm run test:e2e -- --project=chromium --project=firefox --project=webkit`
   * Run just one:  `npm run test:e2e -- --project=firefox`
   *
   * Edge uses the same engine as Chromium so the chromium project covers
   * both. To exercise Edge specifically, override the channel:
   *     `--project=chromium --headed -- --browser=msedge`
   *
   * The a11y project is split out so its slower axe-core scans don't run
   * against every browser by default — running it in chromium is enough
   * for an a11y-tree assertion since the underlying axe rules don't vary
   * by browser engine.
   */
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/stagehand/**", "**/a11y/**"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: ["**/stagehand/**", "**/a11y/**"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testIgnore: ["**/stagehand/**", "**/a11y/**"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "a11y",
      testMatch: ["**/a11y/**/*.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "stagehand",
      testMatch: ["**/stagehand/**/*.spec.ts"],
      // Stagehand calls an LLM on every act/extract — give it room.
      timeout: 180_000,
      expect: { timeout: 30_000 },
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.REUSE_DEV_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
