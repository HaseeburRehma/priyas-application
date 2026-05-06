import { test, expect } from "../fixtures/stagehand-fixture";
import { USERS } from "../fixtures/users";

/**
 * Tablet onboarding wizard — scripted in plain English.
 *
 * This is exactly the kind of flow Stagehand pays for itself on:
 * a multi-step wizard with conditional fields (alltagshilfe-only),
 * a slider, day chips, and a canvas-based signature pad. Writing
 * deterministic selectors for that signature canvas would be ugly;
 * here we just describe what we want the user to do.
 */
test.describe("Stagehand · Tablet onboarding", () => {
  test("dispatcher onboards an alltagshilfe client end-to-end", async ({
    stagePage,
    baseURL,
  }) => {
    // ---- Sign in ----
    await stagePage.goto(`${baseURL}/login`);
    await stagePage.act(
      `Type "${USERS.dispatcher.email}" into the email field`,
    );
    await stagePage.act(
      `Type "${USERS.dispatcher.password}" into the password field`,
    );
    await stagePage.act("Click the sign-in button");
    await stagePage.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // ---- Open the onboarding wizard ----
    await stagePage.goto(`${baseURL}/onboard`);

    // ---- Step 1: Type ----
    await stagePage.act("Select Alltagshilfe as the customer type");
    await stagePage.act("Click the Next button");

    // ---- Step 2: Client details ----
    const stamp = Date.now();
    const name = `Stagehand Testkunde ${stamp}`;
    await stagePage.act(`Set the client name to "${name}"`);
    await stagePage.act('Set the contact person to "Frau Test"');
    await stagePage.act('Set the email to "stagehand@example.test"');
    await stagePage.act('Set the phone to "+49 30 1234567"');
    await stagePage.act('Set the health insurer to "AOK"');
    await stagePage.act('Set the insurance number to "A123456789"');
    await stagePage.act("Set the care level to 3");
    await stagePage.act("Click the Next button");

    // ---- Step 3: Address (optional but fill it) ----
    await stagePage.act('Set the street and number to "Musterstraße 12"');
    await stagePage.act('Set the postal code to "10115"');
    await stagePage.act('Set the city to "Berlin"');
    await stagePage.act("Click the Next button");

    // ---- Step 4: Service preferences ----
    await stagePage.act("Pick weekly as the frequency");
    await stagePage.act("Pick Wednesday as the preferred day");
    await stagePage.act("Click the Next button");

    // ---- Step 5: Review + sign ----
    await stagePage.act('Set the signed-by name to "Frau Test"');
    // Sign the canvas — Stagehand can perform pointer drags too.
    await stagePage.act(
      "Draw a signature on the signature pad by dragging from left to right across the canvas",
    );
    await stagePage.act("Tick the data-processing consent checkbox");
    await stagePage.act("Click the Finish & save button");

    // ---- Should land on the success page ----
    await stagePage.waitForURL(/\/onboard\/success/, { timeout: 30_000 });
    await expect(stagePage.getByText(/All done|Fertig/i)).toBeVisible();
  });
});
