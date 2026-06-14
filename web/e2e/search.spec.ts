import { test, expect } from '@playwright/test';

test('browse: default results load, then open one', async ({ page }) => {
  await page.goto('/');
  // Empty-query Popular listing renders result cards (from the Coveo search fixture).
  const cards = page.locator('button:has(img)');
  await expect(cards.first()).toBeVisible();
  await expect(page.getByText(/results/)).toBeVisible();
  // Tapping a result routes to the asset detail page (served from the detail fixture).
  await cards.first().click();
  await expect(page).toHaveURL(/\/asset\/\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
