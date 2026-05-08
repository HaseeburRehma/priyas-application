/**
 * WCAG 2.1 AA baseline. Per spec §7 / §8 the platform must pass WCAG 2.1
 * AA. This spec runs axe-core against the most-used surfaces and asserts
 * zero "serious" or "critical" violations.
 *
 * Run with:  `npm run test:a11y`
 *
 * If a violation is detected:
 *   1. Read the rule URL printed in the failure output.
 *   2. Fix the source markup. Avoid suppressing rules unless there's a
 *      genuine compatibility reason (e.g. a third-party widget we
 *      can't fix).
 *   3. To suppress, narrow the rule via `.disableRules([...])` on the
 *      AxeBuilder instance — never via a global `axe.configure()`.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// We treat "minor" + "moderate" axe results as warnings, but fail on
// "serious" + "critical" — those are typically WCAG 2.1 AA blockers
// (contrast, missing labels, keyboard traps, etc.).
const FAILING_IMPACTS = new Set(["serious", "critical"]);

async function runAxe(page: import("@playwright/test").Page, label: string) {
  // Wait for the network to settle so React Server Components are
  // mounted and any client suspense boundaries have resolved before
  // axe walks the tree.
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page })
    // WCAG 2.1 AA tag set — these are the rules the spec demands.
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact && FAILING_IMPACTS.has(v.impact),
  );

  if (blocking.length > 0) {
    // Pretty-print the violations so the failure message is actionable.
    const lines = blocking.map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => `      ${n.target.join(" ")} — ${n.failureSummary}`)
        .join("\n");
      return `  • [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${nodes}`;
    });
    throw new Error(
      `axe-core found ${blocking.length} blocking violation(s) on ${label}:\n${lines.join("\n\n")}`,
    );
  }

  // Surface non-blocking issues as console output so they're visible in
  // CI logs without failing the build.
  const informational = results.violations.filter(
    (v) => !v.impact || !FAILING_IMPACTS.has(v.impact),
  );
  if (informational.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[a11y] ${label} — ${informational.length} non-blocking finding(s):`,
      informational.map((v) => `${v.id} (${v.impact ?? "minor"})`).join(", "),
    );
  }

  expect(blocking).toEqual([]);
}

test.describe("WCAG 2.1 AA baseline", () => {
  test("login page", async ({ page }) => {
    await page.goto("/login");
    await runAxe(page, "/login");
  });

  test("register page", async ({ page }) => {
    await page.goto("/register");
    await runAxe(page, "/register");
  });

  test("forgot password page", async ({ page }) => {
    await page.goto("/forgot-password");
    await runAxe(page, "/forgot-password");
  });

  // Skip dashboard surfaces by default — they require an authenticated
  // session. To enable, sign in via the auth fixture (see
  // tests/e2e/fixtures/auth.ts) before navigating.
  test.skip("dashboard (requires auth fixture)", async ({ page }) => {
    await page.goto("/dashboard");
    await runAxe(page, "/dashboard");
  });
});
