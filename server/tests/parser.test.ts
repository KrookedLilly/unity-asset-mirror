import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractHydrationJson, ParserError, parseAssetDetail } from '../src/parser.js';
import { parseReviews } from '../src/parser.js';

const html = readFileSync(new URL('./fixtures/detail-341308.html', import.meta.url), 'utf-8');

describe('extractHydrationJson', () => {
  it('returns the parsed ReactDOMrender argument', () => {
    const data = extractHydrationJson(html);
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveProperty('ENTITY');
    expect(data.data.ENTITY.Product['341308'].name).toContain('Text Animator');
  });

  it('throws ParserError when the anchor is missing', () => {
    expect(() => extractHydrationJson('<html>no controller here</html>')).toThrow(ParserError);
  });
});

describe('parseAssetDetail', () => {
  const asset = parseAssetDetail(html, '341308');

  it('maps core fields', () => {
    expect(asset.id).toBe('341308');
    expect(asset.name).toContain('Text Animator');
    expect(asset.publisher).toBe('Febucci');
    expect(asset.category).toBe('Tools/GUI');
    expect(asset.rating).toBe(5);
    expect(asset.ratingCount).toBe(171);
  });

  it('maps pricing', () => {
    expect(asset.price.originalPrice).toBe('65.00');
    expect(asset.price.finalPrice).toBe('32.50');
    expect(asset.price.onSale).toBe(true);
    expect(asset.price.isFree).toBe(false);
  });

  it('maps gallery images with absolute https urls', () => {
    expect(asset.images.length).toBeGreaterThan(0);
    for (const im of asset.images) {
      expect(im.imageUrl).toMatch(/^https:\/\//);
      expect(im.thumbnailUrl).toMatch(/^https:\/\//);
    }
  });

  it('resolves tags and formats download size', () => {
    expect(asset.tags).toContain('Animation');
    expect(asset.downloadSize).toMatch(/KB|MB|GB/);
  });

  it('throws when the product id is absent', () => {
    expect(() => parseAssetDetail(html, '999999999')).toThrow(ParserError);
  });
});

const reviewsHtml = readFileSync(new URL('./fixtures/reviews-341308.html', import.meta.url), 'utf-8');

describe('extractHydrationJson is controller-agnostic', () => {
  it('extracts the hydration JSON from the reviews page too', () => {
    const data = extractHydrationJson(reviewsHtml);
    expect(data?.data?.ENTITY?.Product?.['341308']).toBeTruthy();
    expect(data.data.ENTITY.Comment).toBeTruthy();
  });
});

describe('parseReviews', () => {
  const out = parseReviews(reviewsHtml, '341308', 'helpful', 1);
  it('maps reviews with author/title/body/helpful and pagination', () => {
    expect(out.reviews.length).toBeGreaterThan(0);
    expect(out.total).toBeGreaterThan(0);
    expect(out.lastPage).toBeGreaterThan(1);
    expect(out.pageSize).toBe(10);
    expect(out.sort).toBe('helpful');
    const r = out.reviews[0];
    expect(typeof r.title).toBe('string');
    expect(typeof r.body).toBe('string');
    expect(typeof r.helpfulCount).toBe('number'); // parsed from the string is_helpful.count
    expect(r.author === null || typeof r.author === 'string').toBe(true);
  });
  it('maps publisher replies (ref to another Comment) when present', () => {
    // Synthetic hydration: one review with a reply that derefs to a Comment by a publisher user.
    const html = '<script>x.ReactDOMrender(' + JSON.stringify({
      data: { ENTITY: {
        Product: { '1': { 'reviews({})': { total_entries: 1, last_page: 1, comments: [{ type: 'id', id: ['Comment', '10'] }] } } },
        Comment: {
          '10': { id: '10', rating: 4, subject: 'T', full: 'B', date: '2024-01-01T00:00:00Z', version: '1.0',
                  is_helpful: { count: '3', score: '2' }, user: { type: 'id', id: ['ConnectUserProfile', '99'] },
                  replies: [{ type: 'id', id: ['Comment', '11'] }] },
          '11': { id: '11', full: 'Thanks for the feedback!', date: '2024-01-02T00:00:00Z',
                  user: { type: 'id', id: ['ConnectUserProfile', '50'] }, replies: [] },
        },
        ConnectUserProfile: { '99': { name: 'Reviewer' }, '50': { name: 'Publisher' } },
      } },
    }) + ')</script>';
    const r = parseReviews(html, '1', 'helpful', 1).reviews[0];
    expect(r.rating).toBe(4);
    expect(r.helpfulCount).toBe(3);
    expect(r.helpfulScore).toBe(2);
    expect(r.author).toBe('Reviewer');
    expect(r.replies).toEqual([{ author: 'Publisher', date: '2024-01-02T00:00:00Z', body: 'Thanks for the feedback!' }]);
  });
  it('throws ParserError when the product/reviews block is absent', () => {
    expect(() => parseReviews('<script>x.ReactDOMrender({"data":{"ENTITY":{"Product":{}}})</script>', '1', 'recent', 1)).toThrow(ParserError);
  });
  it('prefers the reviews(...) cache key matching the requested page + sort', () => {
    // Two reviews( keys in the Apollo cache: one for page 1, one for page 2 (same sort).
    const html = '<script>x.ReactDOMrender(' + JSON.stringify({
      data: { ENTITY: {
        Product: { '1': {
          'reviews({"rows":10,"page":1,"sortBy":"helpful"})': { total_entries: 2, last_page: 2, comments: [{ type: 'id', id: ['Comment', 'p1'] }] },
          'reviews({"rows":10,"page":2,"sortBy":"helpful"})': { total_entries: 2, last_page: 2, comments: [{ type: 'id', id: ['Comment', 'p2'] }] },
        } },
        Comment: {
          'p1': { id: 'p1', rating: 5, subject: 'Page one', full: 'first', replies: [] },
          'p2': { id: 'p2', rating: 3, subject: 'Page two', full: 'second', replies: [] },
        },
      } },
    }) + ')</script>';
    const out = parseReviews(html, '1', 'helpful', 2);
    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0].id).toBe('p2');
    expect(out.reviews[0].title).toBe('Page two');
  });
});
