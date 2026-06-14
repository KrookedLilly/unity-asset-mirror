import { describe, it, expect } from 'vitest';
import { buildSearchBody } from '../src/searchService.js';

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
