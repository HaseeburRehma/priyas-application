// Quick standalone diagnostic for Stagehand. Bypasses Playwright entirely
// so we see the raw error without any wrapping.
//
// Run from the app/ directory:
//   node tests/e2e/debug-stagehand.mjs

import { Stagehand, AISdkClient } from "@browserbasehq/stagehand";
import { anthropic } from "@ai-sdk/anthropic";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });

const keyLen = (process.env.ANTHROPIC_API_KEY || "").length;
console.log("keyLen=", keyLen);
if (keyLen === 0) {
  console.error("ANTHROPIC_API_KEY missing from .env.local — abort.");
  process.exit(1);
}

try {
  const llmClient = new AISdkClient({
    model: anthropic("claude-haiku-4-5"),
  });
  console.log("llmClient built:", !!llmClient);

  const sh = new Stagehand({ env: "LOCAL", llmClient, verbose: 1 });
  await sh.init();
  console.log("Stagehand initialized.");

  await sh.page.goto("http://localhost:3000/login");
  console.log("Page loaded.");

  await sh.page.act("Click the sign-in button");
  console.log("Action completed.");

  await sh.close();
  console.log("Closed cleanly. ✅");
} catch (err) {
  console.error("\n━━━━━━━━━━ RAW ERROR ━━━━━━━━━━");
  console.error(err);
  console.error("\n━━━━━━━━━━ STACK ━━━━━━━━━━");
  console.error(err?.stack);
  process.exit(2);
}
