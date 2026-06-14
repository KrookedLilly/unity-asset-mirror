import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fetchAssetHtml } from '../src/fetcher.js';
import { fetchReviewsHtml } from '../src/fetcher.js';

const fixture = fileURLToPath(new URL('./fixtures/detail-341308.html', import.meta.url));
const reviewsFixture = fileURLToPath(new URL('./fixtures/reviews-341308.html', import.meta.url));

describe('fetchAssetHtml', () => {
  afterEach(() => { delete process.env.ASSET_FIXTURE; });

  it('returns fixture HTML when ASSET_FIXTURE is set', async () => {
    process.env.ASSET_FIXTURE = fixture;
    const html = await fetchAssetHtml('341308');
    expect(html).toContain('Product_ProductDetailController');
  });
});

describe('fetchReviewsHtml', () => {
  afterEach(() => { delete process.env.REVIEWS_FIXTURE; });
  it('returns fixture HTML when REVIEWS_FIXTURE is set', async () => {
    process.env.REVIEWS_FIXTURE = reviewsFixture;
    const html = await fetchReviewsHtml('341308', 'helpful', 1);
    expect(html).toContain('Product_ReviewController');
  });
});
