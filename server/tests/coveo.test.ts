import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSearchToken, coveoSearch, __resetTokenCache } from '../src/coveo.js';

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

  it('caches a token whose exp cannot be decoded (1h fallback), not re-minting next call', async () => {
    // Regression guard: a token with no decodable exp must NOT defeat the cache.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => `"not-a-jwt"` });
    vi.stubGlobal('fetch', fetchMock);
    await getSearchToken('Assetstore_Search');
    await getSearchToken('Assetstore_Search');
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached via 1h fallback, not re-minted
  });
});

describe('coveoSearch 401 retry', () => {
  beforeEach(() => __resetTokenCache());
  afterEach(() => vi.restoreAllMocks());

  it('refreshes the token and retries once when the search endpoint returns 401', async () => {
    delete process.env.COVEO_FIXTURE_DIR; // ensure the real fetch path, not fixture mode
    const jwt = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    let searchCalls = 0;
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes('search-token')) {
        return { ok: true, status: 200, text: async () => `"${jwt}"` };
      }
      // search endpoint
      searchCalls += 1;
      if (searchCalls === 1) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ results: [], totalCount: 0 }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(coveoSearch('Assetstore_Search', {})).resolves.toEqual({ results: [], totalCount: 0 });
    expect(searchCalls).toBe(2); // one 401 + one retry
  });
});
