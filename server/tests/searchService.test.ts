import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSearchBody, mapResults } from '../src/searchService.js';
const searchFixture = JSON.parse(readFileSync(new URL('./fixtures/coveo-search-terrain.json', import.meta.url), 'utf-8'));

describe('buildSearchBody', () => {
  it('paginates and maps the default sort', () => {
    const b: any = buildSearchBody({ q: 'terrain', page: 2 });
    expect(b.q).toBe('terrain');
    expect(b.numberOfResults).toBe(24);
    expect(b.firstResult).toBe(48);
    expect(b.sortCriteria).toBe('relevancy');
  });

  it('defaults an empty query to popular', () => {
    const b: any = buildSearchBody({});
    expect(b.sortCriteria).toBe('@ec_best_selling_score_last_year descending');
  });

  it('builds an AND-combined aq from filters', () => {
    const b: any = buildSearchBody({ q: 'x', category: 'tools', subcategory: 'tools > terrain', free: true, onSale: true });
    expect(b.aq).toBe('@ec_category_level1=="tools" AND @ec_category_level2=="tools > terrain" AND @ec_price==0 AND @ec_sale_filters==on_sale');
  });

  it('maps sort keys', () => {
    expect((buildSearchBody({ q: 'x', sort: 'price-asc' }) as any).sortCriteria).toBe('@ec_price_filter ascending');
    expect((buildSearchBody({ q: 'x', sort: 'rating' }) as any).sortCriteria).toBe('@ec_rating_sort descending');
  });
});

describe('mapResults', () => {
  const out = mapResults(searchFixture, 0);
  it('maps hits to SearchResult with numeric id-as-string', () => {
    expect(out.results.length).toBeGreaterThan(0);
    const r = out.results[0];
    expect(r.id).toMatch(/^\d+$/);
    expect(typeof r.name).toBe('string');
    expect(r.thumbnail === null || r.thumbnail.startsWith('https://')).toBe(true);
  });
  it('derives pricing incl. sale + free', () => {
    for (const r of out.results) {
      expect(typeof r.price.isFree).toBe('boolean');
      if (r.price.onSale) expect(r.price.finalPrice! <= (r.price.originalPrice ?? Infinity)).toBe(true);
      if (r.price.isFree) expect(r.price.finalPrice === 0 || r.price.finalPrice === null).toBe(true);
    }
  });
  it('reports pagination', () => {
    expect(out.totalCount).toBeGreaterThan(0);
    expect(out.pageSize).toBe(24);
    expect(out.hasMore).toBe(out.totalCount > 24);
  });
});
