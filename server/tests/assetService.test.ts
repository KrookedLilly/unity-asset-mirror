import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/cache.js';
import { getAsset } from '../src/assetService.js';

const fixture = fileURLToPath(new URL('./fixtures/detail-341308.html', import.meta.url));

describe('getAsset', () => {
  beforeEach(() => { process.env.ASSET_FIXTURE = fixture; });
  afterEach(() => { delete process.env.ASSET_FIXTURE; });

  it('fetches+parses on a miss, then serves from cache', async () => {
    const db = openDb(':memory:');
    const a1 = await getAsset(db, '341308');
    expect(a1.name).toContain('Text Animator');
    // Corrupt the fixture path; a cache hit must still succeed.
    process.env.ASSET_FIXTURE = '/nonexistent';
    const a2 = await getAsset(db, '341308');
    expect(a2.id).toBe('341308');
  });

  it('force bypasses the cache', async () => {
    const db = openDb(':memory:');
    await getAsset(db, '341308');
    process.env.ASSET_FIXTURE = '/nonexistent';
    await expect(getAsset(db, '341308', { force: true })).rejects.toThrow();
  });
});
