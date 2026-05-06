import { test, expect } from "../fixtures/stagehand-fixture";
import { USERS } from "../fixtures/users";
import { z } from "zod";

/**
 * Exploratory smoke run — autonomous walk-through.
 *
 * Stagehand's `extract` is the right tool for "give me a structured
 * snapshot of this page so I can assert on it." We use it here to
 * sanity-check that every top-level destination renders meaningful
 * content for the admin user. This is a great pre-deploy smoke test:
 * it catches "page renders but is empty" issues that strict selector
 * tests miss.
 */
const ROUTES = [
  "/dashboard",
  "/clients",
  "/properties",
  "/schedule",
  "/employees",
  "/training",
  "/reports",
  "/invoices",
  "/notifications",
  "/settings",
] as const;

test.describe("Stagehand · Exploratory smoke", () => {
  test("admin can land on every page and see meaningful content", async ({
    stagePage,
    baseURL,
  }) => {
    // Sign in once.
    await stagePage.goto(`${baseURL}/login`);
    await stagePage.act(`Type "${USERS.admin.email}" into the email field`);
    await stagePage.act(
      `Type "${USERS.admin.password}" into the password field`,
    );
    await stagePage.act("Click the sign-in button");
    await stagePage.waitForURL(/\/dashboard/, { timeout: 15_000 });

    for (const r of ROUTES) {
      await stagePage.goto(`${baseURL}${r}`);
      const snap = await stagePage.extract({
        instruction:
          "Summarize this page: the main heading, a one-line description of what's shown, and whether there are visible errors. " +
          "If the page looks broken or empty, set hasErrors to true and explain in errorSummary.",
        schema: z.object({
          heading: z.string(),
          description: z.string(),
          hasErrors: z.boolean(),
          errorSummary: z.string().optional(),
        }),
      });
      // Log the AI's read of the page — Playwright's reporter shows this.
      // eslint-disable-next-line no-console
      console.log(`[${r}] ${snap.heading} — ${snap.description}`);
      expect(snap.hasErrors, `${r}: ${snap.errorSummary ?? "ok"}`).toBe(false);
      expect(snap.heading.length).toBeGreaterThan(0);
    }
  });
});
