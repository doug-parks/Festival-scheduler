import { test, expect } from "@playwright/test";

/**
 * Username onboarding E2E (issue #2, mirrored as a regression net for #14).
 *
 * Exercising the real Google OAuth callback requires a test account and live
 * Supabase keys, so the full sign-in round-trip is gated behind
 * `E2E_AUTHENTICATED=1`. The unauthenticated path — navigating directly to
 * `/onboarding/username` should bounce a logged-out user — runs against any
 * preview URL.
 */
test("unauthenticated user cannot view onboarding/username", async ({
  page,
}) => {
  await page.goto("/onboarding/username");
  // Middleware should redirect to "/" for a logged-out user.
  await expect(page).toHaveURL(/\/$/);
});

test.describe("authenticated onboarding flow", () => {
  test.skip(
    !process.env.E2E_AUTHENTICATED,
    "Requires a seeded auth session; set E2E_AUTHENTICATED=1 to run.",
  );

  test("submits a unique username and lands on /calendar", async ({ page }) => {
    await page.goto("/onboarding/username");

    const input = page.getByPlaceholder(/dougparks/i);
    await expect(input).toBeVisible();

    // A unique username for this run.
    const candidate = `pwtest_${Date.now().toString().slice(-8)}`;
    await input.fill(candidate);

    // Inline async check should resolve to "Available" before the submit
    // button becomes enabled.
    await expect(page.getByText(/✓ Available/)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /Set username/i }).click();

    await expect(page).toHaveURL(/\/calendar$/);
  });
});
