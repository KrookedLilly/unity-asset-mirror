# Search & Browse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified mobile Browse home — keyword search, dynamic category browse, sort, and Free/On-Sale filters — powered by Unity's anonymous Coveo backend, with results deep-linking into the existing asset detail/gallery page.

**Architecture:** A new backend seam (`coveo.ts`) mints an anonymous Coveo search token (in-memory cache + refresh) and POSTs queries; `searchService.ts` translates UI params → a Coveo body and maps hits → a lean `SearchResult` (and the category facet → a `Category` tree). Two new endpoints (`/api/search`, `/api/categories`) feed a new Vue `BrowseView` that replaces the old OpenAsset home; results route to the existing `/asset/:id`.

**Tech Stack:** Express + TS + Vitest + supertest (backend), Vue 3 + Vite + Tailwind v4 + Playwright (frontend). Coveo Search API v2.

**Grounding (verified live 2026-06-14):** token mint `GET https://assetstore.unity.com/api/coveo/search-token?searchHub=<hub>` (header `x-client-id: compass-ui`) → quoted JWT (24h); search `POST https://unitytechnologiesproductionmkahteav.org.coveo.com/rest/search/v2?organizationId=unitytechnologiesproductionmkahteav` with `Authorization: Bearer`, body must include `context:{userGroups:"assetStoreUsers"}`. Hit fields under `result.raw`: `permanentid`(str), `ec_name`, `ec_price`(num list price), `ec_price_filter`(num effective), `ec_sale_filters`(arr), `ec_sale_discount_percentage_filter`(num fraction), `ec_thumbnails`(https str), `ec_rating`, `ec_rating_count`, `publisher_name`, `ec_category_level1`, `ec_category_level2`. Categories: `response.facets[0].values[] = {value, numberOfResults}`.

**Caching decisions (YAGNI):** token + categories cached **in-memory** (no SQLite change). Server-side search-result caching is **deferred** — Coveo is ~200ms and the frontend preserves state on back-nav; revisit if volume warrants.

---

## File Structure

```
server/src/
  types.ts          # + SearchResult, SearchResultPrice, SearchResponse, Category, SearchParams
  coveo.ts          # NEW: getSearchToken (mint+cache+refresh), coveoSearch (POST + 401 retry + fixture mode)
  searchService.ts  # NEW: buildSearchBody, mapResults, mapCategories/labelFor, search(), getCategories()
  routes.ts         # + GET /api/search, GET /api/categories (DI for tests)
server/tests/
  fixtures/coveo-search-terrain.json   # NEW (captured)
  fixtures/coveo-facets-categories.json# NEW (captured)
  coveo.test.ts        # NEW: token mint/cache/refresh
  searchService.test.ts# NEW: buildSearchBody, mapResults, mapCategories
  routes.test.ts       # + search/categories route tests
web/src/
  api.ts            # + SearchResult/Category types, search(), getCategories()
  router.ts         # / -> BrowseView (was OpenAsset); /asset/:id unchanged
  views/BrowseView.vue       # NEW (the home)
  components/SearchBar.vue    # NEW (keyword + id/URL detection -> "Open asset" shortcut)
  components/ResultList.vue   # NEW
  components/ResultCard.vue   # NEW (list row)
  components/SortMenu.vue     # NEW
  components/FilterToggles.vue# NEW (Free / On-Sale)
  components/CategorySheet.vue# NEW (dynamic, two-level)
  views/OpenAsset.vue        # DELETED (absorbed into SearchBar)
web/e2e/search.spec.ts       # NEW (fixture-backed)
```

---

## Task 1: Search domain types

**Files:** Modify: `server/src/types.ts`

- [ ] **Step 1: Append to `server/src/types.ts`**

```ts
export interface SearchResultPrice {
  isFree: boolean;
  finalPrice: number | null;
  originalPrice: number | null;
  onSale: boolean;
  discountPercent: number | null; // whole percent, e.g. 50
  currency: string;
}

export interface SearchResult {
  id: string;
  name: string;
  publisher: string | null;
  thumbnail: string | null;
  rating: number | null;
  ratingCount: number | null;
  category: string | null;     // ec_category_level1, e.g. "tools"
  subcategory: string | null;  // ec_category_level2, e.g. "tools > terrain"
  price: SearchResultPrice;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Category {
  slug: string;   // facet value, e.g. "tools" or "tools > terrain"
  label: string;  // display label, e.g. "Tools" / "Terrain"
  count: number;
}

export interface SearchParams {
  q?: string;
  category?: string;
  subcategory?: string;
  sort?: string;   // relevance | price-asc | price-desc | rating | newest | popular
  free?: boolean;
  onSale?: boolean;
  page?: number;
}
```

- [ ] **Step 2: Verify it compiles** — Run: `cd server && npx tsc --noEmit` — Expected: no errors.
- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(server): add search/category domain types"
```

---

## Task 2: Capture Coveo fixtures

**Files:** Create: `server/tests/fixtures/coveo-search-terrain.json`, `server/tests/fixtures/coveo-facets-categories.json`

- [ ] **Step 1: Capture both responses**

```bash
mkdir -p server/tests/fixtures
ORG=unitytechnologiesproductionmkahteav
TOKEN=$(curl -s "https://assetstore.unity.com/api/coveo/search-token?searchHub=Assetstore_Search" -H "x-client-id: compass-ui" | tr -d '"')
curl -s -X POST "https://$ORG.org.coveo.com/rest/search/v2?organizationId=$ORG" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"q":"terrain","numberOfResults":24,"firstResult":0,"sortCriteria":"relevancy","searchHub":"Assetstore_Search","context":{"userGroups":"assetStoreUsers"}}' \
  -o server/tests/fixtures/coveo-search-terrain.json
curl -s -X POST "https://$ORG.org.coveo.com/rest/search/v2?organizationId=$ORG" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"q":"","numberOfResults":0,"searchHub":"Assetstore_Listing","context":{"userGroups":"assetStoreUsers"},"facets":[{"facetId":"cat","field":"ec_category_level1","numberOfValues":30,"type":"specific"}]}' \
  -o server/tests/fixtures/coveo-facets-categories.json
```

- [ ] **Step 2: Verify the fixtures are real**

Run: `node -e "const s=require('./server/tests/fixtures/coveo-search-terrain.json'); console.log('results',s.results.length,'total',s.totalCount, s.results[0].raw.ec_name); const f=require('./server/tests/fixtures/coveo-facets-categories.json'); console.log('facetValues', f.facets[0].values.length)"`
Expected: `results 24 total <n> <name>` and `facetValues >= 5`. If the search returns 0 results, the `context.userGroups` was dropped — re-check the curl body.

- [ ] **Step 3: Commit**

```bash
git add server/tests/fixtures/coveo-search-terrain.json server/tests/fixtures/coveo-facets-categories.json
git commit -m "test(server): capture Coveo search + facet fixtures"
```

---

## Task 3: Coveo seam — token + search

**Files:** Create: `server/src/coveo.ts`; Test: `server/tests/coveo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/coveo.test.ts` — Expected: FAIL (cannot find `../src/coveo.js`).

- [ ] **Step 3: Write `server/src/coveo.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes** — Run: `cd server && npx vitest run tests/coveo.test.ts` — Expected: PASS (2 tests).
- [ ] **Step 5: Commit**

```bash
git add server/src/coveo.ts server/tests/coveo.test.ts
git commit -m "feat(server): Coveo token mint/cache/refresh + search with fixture mode"
```

---

## Task 4: searchService — buildSearchBody

**Files:** Create: `server/src/searchService.ts`; Test: `server/tests/searchService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/searchService.test.ts` — Expected: FAIL (no `searchService.js`).

- [ ] **Step 3: Write `server/src/searchService.ts` (first half)**

```ts
import { coveoSearch } from './coveo.js';
import type { SearchResult, SearchResponse, Category, SearchParams } from './types.js';

const SEARCH_HUB = 'Assetstore_Search';
const LISTING_HUB = 'Assetstore_Listing';
export const PAGE_SIZE = 24;

const SORT_MAP: Record<string, string> = {
  relevance: 'relevancy',
  'price-asc': '@ec_price_filter ascending',
  'price-desc': '@ec_price_filter descending',
  rating: '@ec_rating_sort descending',
  newest: '@first_published_at descending',
  popular: '@ec_best_selling_score_last_year descending',
};

export function buildSearchBody(p: SearchParams): object {
  const page = Math.max(0, p.page ?? 0);
  const aq: string[] = [];
  if (p.category) aq.push(`@ec_category_level1=="${p.category}"`);
  if (p.subcategory) aq.push(`@ec_category_level2=="${p.subcategory}"`);
  if (p.free) aq.push('@ec_price==0');
  if (p.onSale) aq.push('@ec_sale_filters==on_sale');
  const sortKey = p.sort ?? 'relevance';
  // Empty keyword with default sort => show Popular instead of a blank relevancy sort.
  const sortCriteria = (!p.q && sortKey === 'relevance') ? SORT_MAP.popular : (SORT_MAP[sortKey] ?? SORT_MAP.relevance);
  return {
    q: p.q ?? '',
    numberOfResults: PAGE_SIZE,
    firstResult: page * PAGE_SIZE,
    sortCriteria,
    ...(aq.length ? { aq: aq.join(' AND ') } : {}),
  };
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `cd server && npx vitest run tests/searchService.test.ts` — Expected: PASS (4 tests).
- [ ] **Step 5: Commit**

```bash
git add server/src/searchService.ts server/tests/searchService.test.ts
git commit -m "feat(server): buildSearchBody (params -> Coveo body)"
```

---

## Task 5: searchService — mapResults

**Files:** Modify: `server/src/searchService.ts`, `server/tests/searchService.test.ts`

- [ ] **Step 1: Add the failing test** (append)

```ts
import { readFileSync } from 'node:fs';
import { mapResults } from '../src/searchService.js';
const searchFixture = JSON.parse(readFileSync(new URL('./fixtures/coveo-search-terrain.json', import.meta.url), 'utf-8'));

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
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/searchService.test.ts` — Expected: FAIL (`mapResults` not exported).

- [ ] **Step 3: Append to `server/src/searchService.ts`**

```ts
function num(v: unknown): number | null { return typeof v === 'number' ? v : null; }
function normThumb(u: unknown): string | null {
  if (typeof u !== 'string' || !u) return null;
  return u.startsWith('//') ? 'https:' + u : u;
}

export function mapResults(json: any, page: number): SearchResponse {
  const hits = Array.isArray(json?.results) ? json.results : [];
  const results: SearchResult[] = hits.map((h: any): SearchResult => {
    const r = h?.raw ?? {};
    const final = num(r.ec_price_filter) ?? num(r.ec_price);
    return {
      id: String(r.permanentid ?? ''),
      name: r.ec_name ?? '',
      publisher: r.publisher_name ?? null,
      thumbnail: normThumb(r.ec_thumbnails),
      rating: num(r.ec_rating),
      ratingCount: num(r.ec_rating_count),
      category: r.ec_category_level1 ?? null,
      subcategory: r.ec_category_level2 ?? null,
      price: {
        isFree: (num(r.ec_price_filter) ?? num(r.ec_price) ?? 0) === 0,
        finalPrice: final,
        originalPrice: num(r.ec_price),
        onSale: Array.isArray(r.ec_sale_filters) && r.ec_sale_filters.includes('on_sale'),
        discountPercent: typeof r.ec_sale_discount_percentage_filter === 'number'
          ? Math.round(r.ec_sale_discount_percentage_filter * 100) : null,
        currency: 'USD',
      },
    };
  }).filter((r) => r.id !== '');
  const totalCount = num(json?.totalCount) ?? 0;
  return { results, totalCount, page, pageSize: PAGE_SIZE, hasMore: (page + 1) * PAGE_SIZE < totalCount };
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `cd server && npx vitest run tests/searchService.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add server/src/searchService.ts server/tests/searchService.test.ts
git commit -m "feat(server): map Coveo hits to SearchResult"
```

---

## Task 6: searchService — categories + search()/getCategories()

**Files:** Modify: `server/src/searchService.ts`, `server/tests/searchService.test.ts`

- [ ] **Step 1: Add the failing test** (append)

```ts
import { mapCategories } from '../src/searchService.js';
const facetFixture = JSON.parse(readFileSync(new URL('./fixtures/coveo-facets-categories.json', import.meta.url), 'utf-8'));

describe('mapCategories', () => {
  const cats = mapCategories(facetFixture);
  it('maps facet values to labelled categories with counts', () => {
    expect(cats.length).toBeGreaterThan(0);
    const tools = cats.find((c) => c.slug === 'tools');
    expect(tools).toBeTruthy();
    expect(tools!.label).toBe('Tools');
    expect(tools!.count).toBeGreaterThan(0);
  });
  it('labels a level-2 slug by its last segment', () => {
    expect(mapCategories({ facets: [{ values: [{ value: 'tools > terrain', numberOfResults: 5 }] }] })[0].label).toBe('Terrain');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/searchService.test.ts` — Expected: FAIL (`mapCategories` not exported).

- [ ] **Step 3: Append to `server/src/searchService.ts`**

```ts
function labelFor(slug: string): string {
  const last = slug.split('>').pop()!.trim();
  return last.split(/[\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function mapCategories(json: any): Category[] {
  const values = json?.facets?.[0]?.values ?? [];
  return values
    .filter((v: any) => typeof v?.value === 'string' && v.value)
    .map((v: any): Category => ({ slug: v.value, label: labelFor(v.value), count: v.numberOfResults ?? 0 }));
}

export async function search(p: SearchParams): Promise<SearchResponse> {
  const json = await coveoSearch(SEARCH_HUB, buildSearchBody(p));
  return mapResults(json, Math.max(0, p.page ?? 0));
}

// In-memory category cache (24h). Key '' = top level; key '<slug>' = that category's subs.
interface CatCache { at: number; cats: Category[]; }
const catCache: Record<string, CatCache> = {};
const CAT_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCategories(parent?: string): Promise<Category[]> {
  const key = parent ?? '';
  const hit = catCache[key];
  if (hit && Date.now() - hit.at < CAT_TTL_MS) return hit.cats;
  const field = parent ? 'ec_category_level2' : 'ec_category_level1';
  const body: any = { q: '', numberOfResults: 0, facets: [{ facetId: 'cat', field, numberOfValues: 30, type: 'specific' }] };
  if (parent) body.aq = `@ec_category_level1=="${parent}"`;
  const cats = mapCategories(await coveoSearch(LISTING_HUB, body));
  catCache[key] = { at: Date.now(), cats };
  return cats;
}

/** test helper */
export function __resetCatCache(): void { for (const k of Object.keys(catCache)) delete catCache[k]; }
```

- [ ] **Step 4: Run to verify it passes** — Run: `cd server && npx vitest run tests/searchService.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add server/src/searchService.ts server/tests/searchService.test.ts
git commit -m "feat(server): category facet mapping + search/getCategories"
```

---

## Task 7: Routes — /api/search and /api/categories

**Files:** Modify: `server/src/routes.ts`, `server/tests/routes.test.ts`

- [ ] **Step 1: Add the failing tests** (append to `routes.test.ts`)

```ts
import { search as realSearch, getCategories as realCats } from '../src/searchService.js';

describe('search routes', () => {
  const okSearch = { results: [{ id: '1', name: 'X' }], totalCount: 1, page: 0, pageSize: 24, hasMore: false } as any;

  function searchApp(over: Partial<{ search: any; getCategories: any }>) {
    return buildApp({} as any, { getAsset: async () => ({} as any), search: realSearch, getCategories: realCats, ...over });
  }

  it('GET /api/search forwards params and returns the response', async () => {
    let seen: any;
    const res = await request(searchApp({ search: async (p: any) => { seen = p; return okSearch; } }))
      .get('/api/search?q=terrain&category=tools&free=1&page=2&sort=rating');
    expect(res.status).toBe(200);
    expect(res.body.results[0].name).toBe('X');
    expect(seen).toMatchObject({ q: 'terrain', category: 'tools', free: true, page: 2, sort: 'rating' });
  });

  it('GET /api/categories returns the tree (and forwards parent)', async () => {
    let parent: any = 'unset';
    const res = await request(searchApp({ getCategories: async (p: any) => { parent = p; return [{ slug: 'tools', label: 'Tools', count: 5 }]; } }))
      .get('/api/categories?parent=tools');
    expect(res.status).toBe(200);
    expect(res.body[0].slug).toBe('tools');
    expect(parent).toBe('tools');
  });

  it('maps a coveo failure to 502', async () => {
    const res = await request(searchApp({ search: async () => { throw new Error('coveo search failed: HTTP 500'); } }))
      .get('/api/search?q=x');
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/routes.test.ts` — Expected: FAIL (`buildApp` doesn't accept `search`/`getCategories`).

- [ ] **Step 3: Update `server/src/routes.ts`**

Change the `Deps` interface and `buildApp` to add the two services and routes. Replace the existing `Deps` interface and the start of `buildApp` with:

```ts
import { getAsset as defaultGetAsset } from './assetService.js';
import { search as defaultSearch, getCategories as defaultGetCategories } from './searchService.js';
import type { Asset, SearchResponse, Category, SearchParams } from './types.js';

interface Deps {
  getAsset: (db: Db, id: string, opts?: { force?: boolean }) => Promise<Asset>;
  search: (p: SearchParams) => Promise<SearchResponse>;
  getCategories: (parent?: string) => Promise<Category[]>;
}

export function buildApp(
  db: Db,
  deps: Deps = { getAsset: defaultGetAsset, search: defaultSearch, getCategories: defaultGetCategories },
): Express {
  const app = express();
  app.use(express.json());
```

Then add these two handlers before `return app;` (keep the existing asset handlers unchanged):

```ts
  app.get('/api/search', (req, res) => {
    const p: SearchParams = {
      q: typeof req.query.q === 'string' ? req.query.q : '',
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      subcategory: typeof req.query.subcategory === 'string' ? req.query.subcategory : undefined,
      sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
      free: req.query.free === '1',
      onSale: req.query.onSale === '1',
      page: Number(req.query.page ?? 0) || 0,
    };
    deps.search(p)
      .then((r) => res.json(r))
      .catch((e) => res.status(/coveo|mapper/i.test((e as Error).message) ? 502 : 500).json({ error: (e as Error).message }));
  });

  app.get('/api/categories', (req, res) => {
    const parent = typeof req.query.parent === 'string' ? req.query.parent : undefined;
    deps.getCategories(parent)
      .then((c) => res.json(c))
      .catch((e) => res.status(502).json({ error: (e as Error).message }));
  });
```

- [ ] **Step 4: Run to verify it passes** — Run: `cd server && npx vitest run tests/routes.test.ts && npx tsc --noEmit` — Expected: PASS + clean typecheck.
- [ ] **Step 5: Commit**

```bash
git add server/src/routes.ts server/tests/routes.test.ts
git commit -m "feat(server): /api/search + /api/categories routes"
```

---

## Task 8: Backend smoke + full suite

- [ ] **Step 1: Full suite** — Run: `cd server && npx vitest run` — Expected: all prior + new tests PASS.
- [ ] **Step 2: Live smoke**

Run: `cd server && (npm run dev &) && sleep 3 && curl -s "localhost:8787/api/search?q=terrain" | python3 -c "import sys,json;d=json.load(sys.stdin);print('total',d['totalCount'],'first',d['results'][0]['name'])"; curl -s "localhost:8787/api/categories" | python3 -c "import sys,json;print('cats',len(json.load(sys.stdin)))"; kill %1`
Expected: `total <n> first <name>` and `cats >= 5`.

- [ ] **Step 3: Commit (if anything changed)** — none expected; proceed.

---

## Task 9: Web API client — search + categories

**Files:** Modify: `web/src/api.ts`

- [ ] **Step 1: Append to `web/src/api.ts`**

```ts
export interface SearchResultPrice { isFree: boolean; finalPrice: number | null; originalPrice: number | null; onSale: boolean; discountPercent: number | null; currency: string; }
export interface SearchResult { id: string; name: string; publisher: string | null; thumbnail: string | null; rating: number | null; ratingCount: number | null; category: string | null; subcategory: string | null; price: SearchResultPrice; }
export interface SearchResponse { results: SearchResult[]; totalCount: number; page: number; pageSize: number; hasMore: boolean; }
export interface Category { slug: string; label: string; count: number; }

export interface SearchQuery { q?: string; category?: string; subcategory?: string; sort?: string; free?: boolean; onSale?: boolean; page?: number; }

export async function search(query: SearchQuery): Promise<SearchResponse> {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.category) p.set('category', query.category);
  if (query.subcategory) p.set('subcategory', query.subcategory);
  if (query.sort) p.set('sort', query.sort);
  if (query.free) p.set('free', '1');
  if (query.onSale) p.set('onSale', '1');
  if (query.page) p.set('page', String(query.page));
  const res = await fetch(`/api/search?${p.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}

export async function getCategories(parent?: string): Promise<Category[]> {
  const res = await fetch(`/api/categories${parent ? `?parent=${encodeURIComponent(parent)}` : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add web/src/api.ts
git commit -m "feat(web): search + categories API client"
```

---

## Task 10: SearchBar (keyword + fold-in open-by-id)

**Files:** Create: `web/src/components/SearchBar.vue`

- [ ] **Step 1: Write `web/src/components/SearchBar.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { extractAssetId } from '../ids.js';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'submit'): void; (e: 'open-asset', id: string): void }>();

const text = ref(props.modelValue);
const directId = computed(() => extractAssetId(text.value));

function submit() {
  emit('update:modelValue', text.value);
  emit('submit');
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <form class="flex gap-2" @submit.prevent="submit">
      <input v-model="text" inputmode="search" placeholder="Search assets, or paste an id / URL"
             class="flex-1 rounded-lg bg-gray-800 px-4 py-3 outline-none focus:ring-2 ring-indigo-500" />
      <button class="rounded-lg bg-indigo-600 px-5 py-3 font-medium active:scale-95">Go</button>
    </form>
    <button v-if="directId" type="button" @click="emit('open-asset', directId)"
            class="self-start rounded-lg bg-gray-800 px-3 py-2 text-sm text-indigo-300 active:scale-95">
      Open asset {{ directId }} →
    </button>
  </div>
</template>
```

- [ ] **Step 2: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add web/src/components/SearchBar.vue
git commit -m "feat(web): SearchBar with id/URL detection"
```

---

## Task 11: ResultCard + ResultList

**Files:** Create: `web/src/components/ResultCard.vue`, `web/src/components/ResultList.vue`

- [ ] **Step 1: Write `web/src/components/ResultCard.vue`**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { SearchResult } from '../api.js';
const props = defineProps<{ result: SearchResult }>();
const router = useRouter();
const fmt = (n: number | null) => (n == null ? '' : `$${n.toFixed(2)}`);
</script>

<template>
  <button type="button" @click="router.push(`/asset/${props.result.id}`)"
          class="flex w-full gap-3 rounded-lg bg-gray-800/60 p-2 text-left active:scale-[0.99]">
    <img v-if="result.thumbnail" :src="result.thumbnail" :alt="result.name" loading="lazy"
         class="h-16 w-16 shrink-0 rounded-md object-cover bg-gray-700" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ result.name }}</div>
      <div class="truncate text-sm text-gray-400">{{ result.publisher }}</div>
      <div class="mt-1 flex items-center gap-2 text-sm">
        <span v-if="result.rating" class="text-amber-400">★ {{ result.rating.toFixed(1) }}</span>
        <span v-if="result.price.isFree" class="text-emerald-400 font-medium">Free</span>
        <template v-else>
          <span class="font-medium">{{ fmt(result.price.finalPrice) }}</span>
          <span v-if="result.price.onSale" class="text-gray-500 line-through">{{ fmt(result.price.originalPrice) }}</span>
        </template>
      </div>
    </div>
  </button>
</template>
```

- [ ] **Step 2: Write `web/src/components/ResultList.vue`**

```vue
<script setup lang="ts">
import type { SearchResult } from '../api.js';
import ResultCard from './ResultCard.vue';
defineProps<{ results: SearchResult[] }>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <ResultCard v-for="r in results" :key="r.id" :result="r" />
  </div>
</template>
```

- [ ] **Step 3: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 4: Commit**

```bash
git add web/src/components/ResultCard.vue web/src/components/ResultList.vue
git commit -m "feat(web): result list + card (list row)"
```

---

## Task 12: SortMenu + FilterToggles

**Files:** Create: `web/src/components/SortMenu.vue`, `web/src/components/FilterToggles.vue`

- [ ] **Step 1: Write `web/src/components/SortMenu.vue`**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();
const opts = [
  ['relevance', 'Relevance'], ['popular', 'Popular'], ['newest', 'Newest'],
  ['rating', 'Top rated'], ['price-asc', 'Price ↑'], ['price-desc', 'Price ↓'],
] as const;
</script>

<template>
  <select :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
          class="rounded-lg bg-gray-800 px-3 py-2 text-sm outline-none">
    <option v-for="[v, label] in opts" :key="v" :value="v">{{ label }}</option>
  </select>
</template>
```

- [ ] **Step 2: Write `web/src/components/FilterToggles.vue`**

```vue
<script setup lang="ts">
const props = defineProps<{ free: boolean; onSale: boolean }>();
const emit = defineEmits<{ (e: 'update:free', v: boolean): void; (e: 'update:onSale', v: boolean): void }>();
const cls = (on: boolean) => `rounded-full px-3 py-1 text-sm active:scale-95 ${on ? 'bg-indigo-600' : 'bg-gray-800'}`;
</script>

<template>
  <div class="flex gap-2">
    <button type="button" :class="cls(props.free)" @click="emit('update:free', !props.free)">Free</button>
    <button type="button" :class="cls(props.onSale)" @click="emit('update:onSale', !props.onSale)">On-Sale</button>
  </div>
</template>
```

- [ ] **Step 3: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 4: Commit**

```bash
git add web/src/components/SortMenu.vue web/src/components/FilterToggles.vue
git commit -m "feat(web): sort menu + free/on-sale toggles"
```

---

## Task 13: CategorySheet (dynamic, two-level)

**Files:** Create: `web/src/components/CategorySheet.vue`

- [ ] **Step 1: Write `web/src/components/CategorySheet.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { getCategories, type Category } from '../api.js';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', sel: { category?: string; subcategory?: string }): void }>();

const tops = ref<Category[]>([]);
const expanded = ref<string | null>(null);
const subs = ref<Category[]>([]);
const loaded = ref(false);

watch(() => props.open, async (o) => {
  if (o && !loaded.value) { tops.value = await getCategories(); loaded.value = true; }
});

async function toggle(cat: Category) {
  if (expanded.value === cat.slug) { expanded.value = null; return; }
  expanded.value = cat.slug; subs.value = [];
  subs.value = await getCategories(cat.slug);
}
function pickAll() { emit('select', {}); emit('close'); }
function pickCat(slug: string) { emit('select', { category: slug }); emit('close'); }
function pickSub(category: string, subcategory: string) { emit('select', { category, subcategory }); emit('close'); }
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-end bg-black/50" @click.self="emit('close')">
    <div class="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-gray-900 p-4">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Categories</h2>
        <button class="text-gray-400" @click="emit('close')">Close</button>
      </div>
      <button class="w-full rounded-lg px-3 py-2 text-left text-indigo-300" @click="pickAll">All categories</button>
      <div v-for="c in tops" :key="c.slug" class="border-t border-gray-800">
        <div class="flex items-center">
          <button class="flex-1 px-3 py-3 text-left" @click="pickCat(c.slug)">
            {{ c.label }} <span class="text-gray-500 text-sm">({{ c.count }})</span>
          </button>
          <button class="px-3 py-3 text-gray-400" @click="toggle(c)">{{ expanded === c.slug ? '▾' : '▸' }}</button>
        </div>
        <div v-if="expanded === c.slug" class="pb-2 pl-4">
          <button v-for="s in subs" :key="s.slug" class="block w-full px-3 py-2 text-left text-sm text-gray-300"
                  @click="pickSub(c.slug, s.slug)">{{ s.label }} <span class="text-gray-600">({{ s.count }})</span></button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add web/src/components/CategorySheet.vue
git commit -m "feat(web): dynamic two-level category sheet"
```

---

## Task 14: BrowseView (compose) + make it home

**Files:** Create: `web/src/views/BrowseView.vue`; Modify: `web/src/router.ts`; Delete: `web/src/views/OpenAsset.vue`

- [ ] **Step 1: Write `web/src/views/BrowseView.vue`**

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { search, type SearchResult } from '../api.js';
import SearchBar from '../components/SearchBar.vue';
import SortMenu from '../components/SortMenu.vue';
import FilterToggles from '../components/FilterToggles.vue';
import CategorySheet from '../components/CategorySheet.vue';
import ResultList from '../components/ResultList.vue';

const router = useRouter();
const q = ref(''); const sort = ref('relevance'); const free = ref(false); const onSale = ref(false);
const category = ref<string | undefined>(); const subcategory = ref<string | undefined>();
const sheetOpen = ref(false);
const results = ref<SearchResult[]>([]); const total = ref(0); const page = ref(0);
const loading = ref(false); const error = ref(''); const hasMore = ref(false);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

async function run(reset: boolean) {
  if (loading.value) return;
  loading.value = true; error.value = '';
  if (reset) { page.value = 0; results.value = []; }
  try {
    const r = await search({ q: q.value, category: category.value, subcategory: subcategory.value, sort: sort.value, free: free.value, onSale: onSale.value, page: page.value });
    results.value = reset ? r.results : [...results.value, ...r.results];
    total.value = r.totalCount; hasMore.value = r.hasMore;
  } catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
}
function loadMore() { if (hasMore.value && !loading.value) { page.value += 1; run(false); } }

watch([sort, free, onSale, category, subcategory], () => run(true));
onMounted(() => {
  run(true); // empty query => Popular
  observer = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); });
  if (sentinel.value) observer.observe(sentinel.value);
});
onUnmounted(() => observer?.disconnect());

function onSelect(sel: { category?: string; subcategory?: string }) { category.value = sel.category; subcategory.value = sel.subcategory; }
const categoryLabel = () => subcategory.value ?? category.value ?? 'All categories';
</script>

<template>
  <main class="mx-auto max-w-3xl p-4 pb-24 flex flex-col gap-3">
    <SearchBar v-model="q" @submit="run(true)" @open-asset="(id) => router.push(`/asset/${id}`)" />
    <div class="flex items-center justify-between gap-2">
      <button class="rounded-lg bg-gray-800 px-3 py-2 text-sm active:scale-95" @click="sheetOpen = true">
        {{ categoryLabel() }} ▾
      </button>
      <SortMenu v-model="sort" />
    </div>
    <FilterToggles v-model:free="free" v-model:onSale="onSale" />

    <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
    <p v-if="!error && results.length" class="text-xs text-gray-500">{{ total.toLocaleString() }} results</p>
    <ResultList :results="results" />
    <p v-if="loading" class="py-4 text-center text-gray-400">Loading…</p>
    <p v-else-if="!results.length && !error" class="py-8 text-center text-gray-500">No results.</p>
    <div ref="sentinel" class="h-px"></div>

    <CategorySheet :open="sheetOpen" @close="sheetOpen = false" @select="onSelect" />
  </main>
</template>
```

- [ ] **Step 2: Update `web/src/router.ts`** to make Browse the home and drop OpenAsset

```ts
import { createRouter, createWebHistory } from 'vue-router';
import BrowseView from './views/BrowseView.vue';
import AssetDetail from './views/AssetDetail.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BrowseView },
    { path: '/asset/:id', component: AssetDetail, props: true },
  ],
});
```

- [ ] **Step 3: Delete the old view** — Run: `git rm web/src/views/OpenAsset.vue`

- [ ] **Step 4: Typecheck + build** — Run: `cd web && npx vue-tsc -b && npm run build` — Expected: clean + built.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/BrowseView.vue web/src/router.ts
git commit -m "feat(web): BrowseView home composing search/sort/filters/categories"
```

---

## Task 15: E2E — fixture-backed browse flow

**Files:** Modify: `web/playwright.config.ts`; Create: `web/e2e/search.spec.ts`

- [ ] **Step 1: Update `web/playwright.config.ts`** backend command to also set the Coveo fixture dir

Change the backend `webServer` command to:

```ts
command: 'cross-env ASSET_FIXTURE=./tests/fixtures/detail-341308.html COVEO_FIXTURE_DIR=./tests/fixtures PORT=8787 npm run dev',
```

(leave `cwd: '../server'`, `url`, and the web `webServer` entry unchanged.)

- [ ] **Step 2: Write `web/e2e/search.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('browse: default results load, then open one', async ({ page }) => {
  await page.goto('/');
  // Empty-query Popular listing renders result cards (from the Coveo search fixture).
  const cards = page.locator('button:has(img)');
  await expect(cards.first()).toBeVisible();
  await expect(page.getByText(/results/)).toBeVisible();
  // Tapping a result routes to the asset detail page (served from the detail fixture).
  await cards.first().click();
  await expect(page).toHaveURL(/\/asset\/\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('search box detects a pasted id and offers a direct open', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Search assets/).fill('341308');
  await page.getByRole('button', { name: /Open asset 341308/ }).click();
  await expect(page).toHaveURL(/\/asset\/341308/);
});

test('Free toggle re-runs the query', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('button:has(img)').first()).toBeVisible();
  await page.getByRole('button', { name: 'Free', exact: true }).click();
  await expect(page.locator('button:has(img)').first()).toBeVisible(); // still renders (fixture)
});
```

> Note: the e2e backend runs in `COVEO_FIXTURE_DIR` mode, so every search/category call returns the captured fixture regardless of params — the tests assert flow/wiring (render, navigate, toggle re-runs), not result correctness (that's covered by the unit mapper tests against the same fixture).

- [ ] **Step 3: Run e2e** — Run: `cd web && npx playwright test` — Expected: all tests pass (the MVP gallery spec + the 3 new search specs).

- [ ] **Step 4: Commit**

```bash
git add web/playwright.config.ts web/e2e/search.spec.ts
git commit -m "test(web): fixture-backed browse/search e2e"
```

---

## Task 16: Final verification

- [ ] **Step 1: Backend** — Run: `cd server && npx vitest run && npx tsc --noEmit` — Expected: all green, clean.
- [ ] **Step 2: Frontend** — Run: `cd web && npx vitest run && npx vue-tsc -b && npx playwright test && npm run build` — Expected: all green, clean, built.
- [ ] **Step 3: Live manual smoke** — start both servers (`server: npm run dev`, `web: npm run dev`), open the app: empty home shows Popular; type "terrain" → results; toggle Free; open category sheet → pick a category → list updates; tap a result → detail+gallery. (No commit; verification only.)

---

## Done — what this delivers

The home is now a mobile Browse screen: keyword search, dynamic category browse (two-level sheet), sort, and Free/On-Sale filters over one infinite-scroll list, with results deep-linking into the existing detail + swipe gallery. Backend talks to Coveo anonymously with an auto-refreshed token and a fixture mode for deterministic tests.

**Deferred (later):** full facet rail (publisher/price-range/rating with live counts); account-aware badges (owned/wishlist); server-side search-result caching (Coveo is fast + frontend keeps state — revisit if needed).

## Self-Review

- **Spec coverage:** smart search box w/ id-fold (Task 10), list rows (Task 11), dynamic categories two-level (Tasks 6,13), sort + Free/On-Sale (Tasks 4,12), empty→Popular (Task 4 buildSearchBody), unified Browse home + OpenAsset absorbed (Task 14), Coveo recipe incl. mandatory `context.userGroups` (Task 3 coveoSearch), token cache/refresh + 401 retry (Task 3), endpoints + DI + 502-on-coveo-failure (Task 7), in-memory category cache 24h (Task 6), fixture-backed tests/e2e (Tasks 2,15). Search-result SQLite cache intentionally deferred (documented above).
- **Type consistency:** `SearchResult`/`SearchResultPrice`/`SearchResponse`/`Category`/`SearchParams` identical in `server/src/types.ts` and `web/src/api.ts`. Names used consistently: `getSearchToken`, `coveoSearch`, `buildSearchBody`, `mapResults`, `mapCategories`, `labelFor`, `search`, `getCategories`, `buildApp(db, deps)` extended with `search`/`getCategories`.
- **No placeholders:** every step has runnable code + commands + expected output; fixture capture is a concrete curl; the only non-determinism (live counts) is explicitly handled by fixture mode.
