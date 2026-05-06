import { test, expect } from "@playwright/test";
import { USERS } from "./fixtures/users";
import { signIn } from "./fixtures/auth";

test.describe("Authentication", () => {
  test("login page renders and accepts a real account", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /Willkommen|Sign in|Anmelden/i }),
    ).toBeVisible();

    await signIn(page, "admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("rejects an invalid password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/E-?Mail/i).fill(USERS.admin.email);
    await page.getByLabel(/Passwort|Password/i).fill("WRONG-PASSWORD");
    await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();
    // Either a toast or an inline error — we just need to stay on /login.
    await expect(page).toHaveURL(/\/login/);
  });

  test("dashboard redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
