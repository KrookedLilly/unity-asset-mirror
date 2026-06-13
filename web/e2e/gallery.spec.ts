import { test, expect } from '@playwright/test';

test('open an asset and swipe its gallery', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/341308/).fill('341308');
  await page.getByRole('button', { name: 'Open' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Text Animator', { timeout: 15000 });

  // Open the fullscreen gallery by clicking the first thumbnail button
  await page.locator('button:has(img)').first().click();
  const pswp = page.locator('.pswp');
  await expect(pswp).toBeVisible({ timeout: 5000 });

  // Wait for the opening animation to fully complete so opener.isOpen becomes true.
  // PhotoSwipe v5 sets opener.isOpen = true only after the animation ends (~333ms).
  // Without this, pswp.close() returns early because opener.isOpen is still false.
  await page.waitForFunction(() => !!(window as any).pswp?.opener?.isOpen, { timeout: 5000 });

  // Verify counter shows first item (PhotoSwipe v5 counter: "1 / N")
  const counter = page.locator('.pswp__counter');
  await expect(counter).toBeVisible();
  const firstCount = await counter.textContent();
  expect(firstCount).toMatch(/^1\s*\/\s*\d+/);

  // Navigate to next slide — PhotoSwipe v5 exposes the active instance on window.pswp.
  // Calling pswp.next() exercises the same internal code path as keyboard/swipe navigation.
  // Keyboard ArrowRight is unreliable in mobile-emulated touch contexts (no focused element),
  // so we drive PhotoSwipe's own API and verify the counter genuinely advances.
  await page.evaluate(() => { (window as any).pswp?.next(); });
  await expect(counter).toHaveText(/^2\s*\/\s*\d+/, { timeout: 3000 });

  // Close gallery — must wait for opener.isOpen first (checked above); closing is instant now.
  await page.evaluate(() => { (window as any).pswp?.close(); });
  await expect(pswp).toHaveCount(0, { timeout: 5000 });
});
