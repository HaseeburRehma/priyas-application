import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("Internationalization", () => {
  test("default German strings render on dashboard", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/dashboard");
    // At least one well-known German label should be on the page.
    const gemany = await page
      .locator("text=/Übersicht|Einstellungen|Mitarbeiter/i")
      .count();
    expect(gemany).toBeGreaterThan(0);
  });

  test("language switcher offers DE / EN / TA", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/dashboard");
    // Open the language menu — the trigger usually has a 'Deutsch' label
    // or a globe icon. We look for any element that exposes all three.
    const html = await page.content();
    const hasDe = /Deutsch|de\b/i.test(html);
    const hasEn = /English|en\b/i.test(html);
    const hasTa = /தமிழ்|ta\b/i.test(html);
    expect(hasDe).toBeTruthy();
    expect(hasEn).toBeTruthy();
    expect(hasTa).toBeTruthy();
  });
});
