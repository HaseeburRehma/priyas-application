import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("Admin (Management) — full access", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin");
  });

  test("can reach every top-level destination", async ({ page }) => {
    const routes = [
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
      "/onboard",
    ];
    for (const r of routes) {
      await page.goto(r);
      await expect(page).toHaveURL(new RegExp(r.replace("/", "\\/")));
      // Page must have rendered some semantic content (h1 or nav landmark).
      const h1 = page.locator("h1, [role=heading][aria-level='1']").first();
      await expect(h1).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Settings → Security section is visible", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /Sicherheit|Security/i }).click();
    await expect(
      page.getByRole("heading", { name: /Two-?factor|Zwei-Faktor/i }),
    ).toBeVisible();
  });

  test("can open the new-client wizard", async ({ page }) => {
    await page.goto("/clients/new");
    await expect(
      page.getByText(/Privat|Residential|Gewerbe|Commercial/i).first(),
    ).toBeVisible();
  });

  test("can open the tablet onboarding flow", async ({ page }) => {
    await page.goto("/onboard");
    await expect(page.getByText(/Onboarding|sign|signatur/i).first()).toBeVisible();
  });
});
