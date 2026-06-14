import { test, expect } from '@playwright/test';

test('asset page shows reviews; sort + load-more work', async ({ page }) => {
  await page.goto('/asset/341308');
  const section = page.getByRole('heading', { name: /Reviews/ });
  await expect(section).toBeVisible();
  // at least one review article renders (10 from the fixture)
  const reviews = page.locator('article:has(p)');
  await expect(reviews.first()).toBeVisible();
  const before = await reviews.count();
  // load more appends (fixture returns 10 each page; lastPage > 1)
  await page.getByRole('button', { name: /Load more reviews/ }).click();
  await expect.poll(async () => reviews.count()).toBeGreaterThan(before);
  // switching sort keeps the section populated
  await page.getByRole('button', { name: 'Recent', exact: true }).click();
  await expect(reviews.first()).toBeVisible();
});
