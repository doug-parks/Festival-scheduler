import { test, expect } from "@playwright/test";

/**
 * Landing-page smoke test. Runs against the URL in `E2E_BASE_URL` (typically
 * a Vercel preview deploy in CI, or the local dev server). The intent here is
 * to confirm the build is at least returning HTML and the Google sign-in CTA
 * is present — not to exercise the OAuth round-trip itself.
 */
test("landing page loads and shows Google sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Fest Planner/i);

  const signIn = page.getByRole("button", { name: /sign in.*google/i });
  await expect(signIn).toBeVisible();
});
