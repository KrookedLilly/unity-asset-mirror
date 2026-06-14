import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { getReviews } from '../src/reviewsService.js';
const fixture = fileURLToPath(new URL('./fixtures/reviews-341308.html', import.meta.url));

describe('getReviews', () => {
  beforeEach(() => { process.env.REVIEWS_FIXTURE = fixture; });
  afterEach(() => { delete process.env.REVIEWS_FIXTURE; });

  it('defaults to helpful sort and page 1, returns mapped reviews', async () => {
    const r = await getReviews('341308');
    expect(r.sort).toBe('helpful');
    expect(r.page).toBe(1);
    expect(r.reviews.length).toBeGreaterThan(0);
  });
  it('rejects an unknown sort (falls back to helpful) and clamps page to >= 1', async () => {
    const r = await getReviews('341308', { sort: 'bogus', page: 0 });
    expect(r.sort).toBe('helpful');
    expect(r.page).toBe(1);
  });
  it('passes through valid sort + page', async () => {
    const r = await getReviews('341308', { sort: 'recent', page: 3 });
    expect(r.sort).toBe('recent');
    expect(r.page).toBe(3);
  });
});
