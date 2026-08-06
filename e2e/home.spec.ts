import { test, expect } from "@playwright/test";

/**
 * Smoke test: the public home page renders and its primary navigation works.
 *
 * This is the starter spec — read-only, no data is written. It exists to prove
 * the Playwright setup end to end and to model the conventions for new specs:
 * prefer role/text locators over CSS, and assert on what a visitor sees (copy is
 * Nicaraguan Spanish) rather than on implementation detail.
 */
test("home page shows the hero headline", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /nosotros lo hacemos lucir/i }),
  ).toBeVisible();
});

test("visitor can reach the catalog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /catálogo/i }).first().click();
  await expect(page).toHaveURL(/\/catalogo/);
});
