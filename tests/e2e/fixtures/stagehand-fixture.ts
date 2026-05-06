import { test as base, type Page } from "@playwright/test";
import {
  AISdkClient,
  Stagehand,
  type ConstructorParams,
} from "@browserbasehq/stagehand";

/**
 * Stagehand-augmented Playwright fixture.
 *
 * Each test gets a `stagePage` — a Playwright Page enriched with Stagehand's
 * AI-driven helpers:
 *   await stagePage.act("click the 'Sign in' button");
 *   await stagePage.observe("find the password field");
 *   await stagePage.extract({ instruction, schema });
 *
 * Why this fixture vs. raw Stagehand:
 * - Reuses Playwright's webServer, baseURL, screenshot/video, retries.
 * - Plays nicely with role-scoped helpers like `signIn()`.
 * - Closes the Stagehand session cleanly after each test.
 *
 * LLM choice — defaults to Anthropic Claude. Override with STAGEHAND_MODEL
 * (e.g. "gpt-4o-mini", "claude-3-5-sonnet-20241022") and the matching
 * provider key in env.
 */

type StagehandFixtures = {
  stagehand: Stagehand;
  stagePage: Page;
};

/**
 * Stagehand 2.5+ uses the Vercel AI SDK under the hood. Rather than rely
 * on Stagehand's internal model-name → provider resolution (which has
 * been flaky on 2.5.8), we construct the AI SDK client ourselves and
 * pass it in as `llmClient`. Stagehand uses it directly — no guessing.
 *
 * Default = Claude Sonnet via Anthropic. Override with STAGEHAND_MODEL
 * (e.g. "openai/gpt-4o-mini").
 */
// Default = Claude Haiku (cheap, fast, current). Override with
// STAGEHAND_MODEL — anything Anthropic currently serves works, e.g.
// "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-5", or for
// OpenAI "openai/gpt-4o-mini".
const MODEL = process.env.STAGEHAND_MODEL ?? "anthropic/claude-haiku-4-5";

function parseProvider(modelId: string): {
  provider: "anthropic" | "openai";
  model: string;
} {
  if (modelId.startsWith("anthropic/")) {
    return { provider: "anthropic", model: modelId.slice("anthropic/".length) };
  }
  if (modelId.startsWith("openai/")) {
    return { provider: "openai", model: modelId.slice("openai/".length) };
  }
  // Bare names — assume Anthropic for Claude*, OpenAI otherwise.
  if (modelId.startsWith("claude")) {
    return { provider: "anthropic", model: modelId };
  }
  return { provider: "openai", model: modelId };
}

async function buildLLMClient(): Promise<AISdkClient> {
  const { provider, model } = parseProvider(MODEL);
  const apiKey =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const which =
      provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    throw new Error(
      `Stagehand requires ${which} in your environment. Add it to .env.local or export it before running.`,
    );
  }

  // The AI SDK's providers read env vars directly. Set them explicitly so
  // it doesn't matter how dotenv propagation lands in the worker process.
  if (provider === "anthropic") {
    process.env.ANTHROPIC_API_KEY = apiKey;
  } else {
    process.env.OPENAI_API_KEY = apiKey;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[stagehand-fixture] provider=${provider} model=${model} keyLen=${apiKey.length}`,
  );

  if (provider === "anthropic") {
    const { anthropic } = await import("@ai-sdk/anthropic");
    return new AISdkClient({ model: anthropic(model) });
  }
  const { openai } = await import("@ai-sdk/openai");
  return new AISdkClient({ model: openai(model) });
}

async function buildStagehandConfig(): Promise<ConstructorParams> {
  const llmClient = await buildLLMClient();
  return {
    env: "LOCAL",
    llmClient,
    verbose: process.env.STAGEHAND_VERBOSE === "1" ? 1 : 0,
    enableCaching: false,
    domSettleTimeoutMs: 5000,
  };
}

export const test = base.extend<StagehandFixtures>({
  stagehand: async ({}, use) => {
    const config = await buildStagehandConfig();
    const sh = new Stagehand(config);
    await sh.init();
    await use(sh);
    await sh.close();
  },
  stagePage: async ({ stagehand, baseURL }, use) => {
    // Stagehand exposes its underlying Playwright Page directly.
    const page = stagehand.page as unknown as Page;
    if (baseURL) {
      // Make relative URLs in tests work the same as in normal Playwright.
      page.context().setDefaultNavigationTimeout(30_000);
    }
    await use(page);
  },
});

export { expect } from "@playwright/test";
