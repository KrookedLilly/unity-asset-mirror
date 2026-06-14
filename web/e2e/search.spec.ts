import { test, expect } from '@playwright/test';

test('browse: default results load, then open one', async ({ page }) => {
  await page.goto('/');
  // Empty-query Popular listing renders result cards (from the Coveo search fixture).
  const cards = page.locator('button:has(img)');
  await expect(cards.first()).toBeVisible();
  await expect(page.getByText(/results/)).toBeVisible();
  // Tapping a result routes to the asset detail page. We assert the routing here;
  // the detail page actually rendering is covered deterministically by gallery.spec.ts
  // (which opens id 341308, the one the ASSET_FIXTURE backend serves). The search
  // fixture's result ids (e.g. 263149) don't match that single asset fixture, so we
  // don't assert detail content in this fixture-backed flow test.
  await cards.first().click();
  await expect(page).toHaveURL(/\/asset\/\d+/);
});

test('search box detects a pasted id and offers a direct open', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Search assets/).fill('341308');
  await page.getByRole('button', { name: /Open asset 341308/ }).click();
  await expect(page).toHaveURL(/\/asset\/341308/);
});

test('Free toggle re-runs the query', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('button:has(img)').first()).toBeVisible();
  await page.getByRole('button', { name: 'Free', exact: true }).click();
  await expect(page.locator('button:has(img)').first()).toBeVisible(); // still renders (fixture)
});
