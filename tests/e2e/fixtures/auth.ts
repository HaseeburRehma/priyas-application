import type { Page } from "@playwright/test";
import { USERS, type TestRole } from "./users";

/**
 * Sign in via the real login form. We don't bypass auth — this exercises
 * the auth flow on every test, which is what we actually want to verify.
 */
export async function signIn(page: Page, role: TestRole): Promise<void> {
  const u = USERS[role];
  await page.goto("/login");
  await page.getByLabel(/E-?Mail/i).fill(u.email);
  await page.getByLabel(/Passwort|Password/i).fill(u.password);
  await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function signOut(page: Page): Promise<void> {
  // Open the user menu (avatar in topbar) and click "Abmelden / Sign out".
  await page.locator('[data-user-menu], [aria-label*="user" i]').first().click();
  await page.getByRole("button", { name: /Abmelden|Sign out|Logout/i }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });
}
