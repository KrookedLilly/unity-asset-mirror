import { describe, it, expect } from 'vitest';
import { openDb, getCachedAsset, putAsset } from '../src/cache.js';
import type { Asset } from '../src/types.js';

function sample(id = '1'): Asset {
  return {
    id, slug: null, name: 'X', description: null, keyFeatures: null, keyImage: null,
    rating: null, ratingCount: null, reviewCount: null, publisher: null, publisherUrl: null,
    category: null, price: { isFree: true, finalPrice: null, originalPrice: null, onSale: false, discountPercent: null, currency: 'USD' },
    downloadSize: null, firstPublishedDate: null, supportedUnityVersions: [], tags: [], images: [],
    fetchedAt: Date.now(),
  };
}

describe('cache', () => {
  it('returns null on a miss, the asset on a fresh hit', () => {
    const db = openDb(':memory:');
    expect(getCachedAsset(db, '1', 1000)).toBeNull();
    putAsset(db, sample('1'));
    expect(getCachedAsset(db, '1', 60_000)?.name).toBe('X');
  });

  it('treats entries older than maxAge as a miss', () => {
    const db = openDb(':memory:');
    const a = sample('2'); a.fetchedAt = Date.now() - 10_000;
    putAsset(db, a);
    expect(getCachedAsset(db, '2', 5_000)).toBeNull();
    expect(getCachedAsset(db, '2', 20_000)?.id).toBe('2');
  });

  it('upserts on repeated put', () => {
    const db = openDb(':memory:');
    putAsset(db, sample('3'));
    const a = sample('3'); a.name = 'Y';
    putAsset(db, a);
    expect(getCachedAsset(db, '3', 60_000)?.name).toBe('Y');
  });

  it('treats a corrupted row as a miss', () => {
    const db = openDb(':memory:');
    db.prepare('INSERT INTO assets (id, json, fetched_at) VALUES (?,?,?)').run('9', 'GARBAGE{', Date.now());
    expect(getCachedAsset(db, '9', 60_000)).toBeNull();
  });
});
