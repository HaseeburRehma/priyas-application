import { test, expect } from "../fixtures/stagehand-fixture";
import { USERS } from "../fixtures/users";
import { z } from "zod";

/**
 * Login flow driven entirely by natural language.
 *
 * Why bother when the deterministic auth.spec.ts already covers this?
 * Because the same instructions survive markup churn — if a designer
 * renames "Anmelden" to "Einloggen" tomorrow, this test still passes
 * while a hand-coded `getByRole("button", { name: /Anmelden/ })` breaks.
 */
test.describe("Stagehand · Login", () => {
  test("admin signs in via plain English", async ({ stagePage, baseURL }) => {
    await stagePage.goto(`${baseURL}/login`);
    await stagePage.act(`Type "${USERS.admin.email}" into the email field`);
    await stagePage.act(`Type "${USERS.admin.password}" into the password field`);
    await stagePage.act("Click the sign-in button");
    await stagePage.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Extract structured data so we can assert on it.
    const summary = await stagePage.extract({
      instruction:
        "From the dashboard, get the user's display name shown in the topbar and any greeting text",
      schema: z.object({
        displayName: z.string(),
        greeting: z.string().optional(),
      }),
    });
    expect(summary.displayName).toContain("Admin");
  });
});
