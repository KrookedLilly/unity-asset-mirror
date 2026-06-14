import { readFile } from 'node:fs/promises';

const ORG = 'unitytechnologiesproductionmkahteav';
const SEARCH_URL = `https://${ORG}.org.coveo.com/rest/search/v2?organizationId=${ORG}`;
const TOKEN_URL = 'https://assetstore.unity.com/api/coveo/search-token';

interface CachedToken { token: string; exp: number; } // exp = epoch seconds
const tokenCache: Record<string, CachedToken> = {};

/** test helper */
export function __resetTokenCache(): void {
  for (const k of Object.keys(tokenCache)) delete tokenCache[k];
}

function decodeExp(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export async function getSearchToken(hub: string): Promise<string> {
  const now = Date.now() / 1000;
  const cached = tokenCache[hub];
  if (cached && cached.exp - now > 300) return cached.token;
  const res = await fetch(`${TOKEN_URL}?searchHub=${encodeURIComponent(hub)}`, {
    headers: { 'x-client-id': 'compass-ui' },
  });
  if (!res.ok) throw new Error(`coveo token mint failed: HTTP ${res.status}`);
  const token = (await res.text()).replace(/^"|"$/g, '').trim();
  tokenCache[hub] = { token, exp: decodeExp(token) };
  return token;
}

async function fixtureFor(hub: string): Promise<any> {
  // COVEO_FIXTURE_DIR makes search deterministic/offline for tests + e2e.
  const dir = process.env.COVEO_FIXTURE_DIR!;
  const file = hub === 'Assetstore_Listing' ? 'coveo-facets-categories.json' : 'coveo-search-terrain.json';
  return JSON.parse(await readFile(`${dir}/${file}`, 'utf-8'));
}

export async function coveoSearch(hub: string, body: object): Promise<any> {
  if (process.env.COVEO_FIXTURE_DIR) return fixtureFor(hub);
  const payload = JSON.stringify({ ...body, searchHub: hub, context: { userGroups: 'assetStoreUsers' } });
  const send = async (token: string) =>
    fetch(SEARCH_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: payload });
  let res = await send(await getSearchToken(hub));
  if (res.status === 401) { // token rejected — refresh once and retry
    __resetTokenCache();
    res = await send(await getSearchToken(hub));
  }
  if (!res.ok) throw new Error(`coveo search failed: HTTP ${res.status}`);
  return res.json();
}
