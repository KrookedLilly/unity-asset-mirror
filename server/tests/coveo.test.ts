import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSearchToken, __resetTokenCache } from '../src/coveo.js';

// Build a fake JWT whose payload.exp is `expSec`.
function fakeJwt(expSec: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: expSec })}.sig`;
}

describe('getSearchToken', () => {
  beforeEach(() => __resetTokenCache());
  afterEach(() => vi.restoreAllMocks());

  it('mints, strips quotes, and caches until near expiry', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => `"${fakeJwt(future)}"` });
    vi.stubGlobal('fetch', fetchMock);

    const t1 = await getSearchToken('Assetstore_Search');
    expect(t1.startsWith('eyJ') || t1.split('.').length === 3).toBe(true);
    expect(t1.includes('"')).toBe(false);
    const t2 = await getSearchToken('Assetstore_Search');
    expect(t2).toBe(t1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached, not re-minted
  });

  it('refreshes when the cached token is within 5 min of expiry', async () => {
    const soon = Math.floor(Date.now() / 1000) + 60; // expires in 1 min
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => `"${fakeJwt(soon)}"` });
    vi.stubGlobal('fetch', fetchMock);
    await getSearchToken('Assetstore_Search');
    await getSearchToken('Assetstore_Search');
    expect(fetchMock).toHaveBeenCalledTimes(2); // re-minted because near expiry
  });
});
