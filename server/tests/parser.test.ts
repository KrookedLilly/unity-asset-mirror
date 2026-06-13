import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractHydrationJson, ParserError, parseAssetDetail } from '../src/parser.js';

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
