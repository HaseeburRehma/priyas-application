import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("Employee (Field Staff) — read-mostly", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "employee");
  });

  test("dashboard loads", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("can submit a vacation request", async ({ page }) => {
    await page.goto("/vacation");
    await expect(
      page.getByRole("heading", { name: /Urlaub|Vacation/i }),
    ).toBeVisible();
    // The "New request" button must be visible to field staff.
    await expect(
      page.getByRole("button", { name: /Neue Anfrage|New request/i }),
    ).toBeVisible();
  });

  test("can open chat", async ({ page }) => {
    await page.goto("/chat");
    // Channel list must be present even if no channel is selected yet.
    await expect(page.locator("ul").first()).toBeVisible();
  });

  test("can view training hub", async ({ page }) => {
    await page.goto("/training");
    await expect(
      page.getByRole("heading", { name: /Schulung|Training/i }),
    ).toBeVisible();
    // Field staff should NOT see the "New module" button.
    await expect(
      page.getByRole("button", { name: /Neues Modul|New module/i }),
    ).toHaveCount(0);
  });

  test("cannot reach /onboard (no client.create permission)", async ({ page }) => {
    await page.goto("/onboard");
    // The page-level guard redirects unauthorized users back to /dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
