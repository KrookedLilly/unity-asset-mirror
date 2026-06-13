# Detail + Gallery MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open any Unity asset by id or pasted URL and view it through a mobile-first page with a PhotoSwipe swipe/pinch fullscreen gallery — backed by an Express/SQLite parse-and-cache server.

**Architecture:** Express + TypeScript backend fetches `https://assetstore.unity.com/packages/p/<id>` (301→ canonical page), extracts the `ReactDOMrender({…})` hydration JSON, reads `data.ENTITY.Product[<id>]`, dereferences its Apollo-normalized refs, and maps to a typed `Asset`. Results are cached in SQLite (read-through, 24h TTL). A Vue 3 + Vite + Tailwind v4 PWA renders the asset and opens its media in PhotoSwipe.

**Tech Stack:** Node 18+ (global fetch), Express, better-sqlite3, TypeScript (NodeNext ESM), Vitest, supertest, Vue 3, Vite, Tailwind v4 (`@tailwindcss/vite`), PhotoSwipe v5, vite-plugin-pwa, DOMPurify, Playwright.

---

## File Structure

```
unity-asset-mirror/
  server/
    package.json · tsconfig.json · vitest.config.ts · .env.example
    src/
      types.ts          # Asset, AssetImage, AssetPrice
      parser.ts         # extractHydrationJson + parseAssetDetail (+ helpers)
      cache.ts          # openDb / getCachedAsset / putAsset
      fetcher.ts        # fetchAssetHtml(id) (+ ASSET_FIXTURE mode)
      assetService.ts   # getAsset(db,id,{force}) = cache→fetch→parse
      routes.ts         # buildApp(db, deps) Express app
      server.ts         # entry
    tests/
      fixtures/detail-341308.html
      parser.test.ts · cache.test.ts · assetService.test.ts · routes.test.ts
  web/
    package.json · vite.config.ts · tsconfig.json · index.html
    src/
      main.ts · App.vue · style.css · api.ts · router.ts · ids.ts
      views/OpenAsset.vue · views/AssetDetail.vue
      components/Gallery.vue
    tests/ids.test.ts
    playwright.config.ts · e2e/gallery.spec.ts
```

Responsibilities are split so each file is independently testable: `parser` is pure (HTML→object), `cache` is pure SQLite, `fetcher` is the only network unit, `assetService` orchestrates, `routes` is thin glue.

---

## Task 1: Backend scaffold

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/.env.example`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "unity-asset-mirror-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.0",
    "dotenv": "^16.4.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^4.17.0",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `server/.env.example`**

```
PORT=8787
DB_PATH=./data.sqlite
# Set to a fixture path to serve HTML from disk instead of the network (tests/dev):
# ASSET_FIXTURE=./tests/fixtures/detail-341308.html
```

- [ ] **Step 5: Install and verify tooling**

Run: `cd server && npm install && npx vitest run`
Expected: install succeeds; vitest reports "No test files found" (exit 0 or "no tests").

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json server/vitest.config.ts server/.env.example
git commit -m "chore(server): scaffold Express+TS+vitest backend"
```

---

## Task 2: Domain types

**Files:**
- Create: `server/src/types.ts`

- [ ] **Step 1: Write `server/src/types.ts`** (no test — pure declarations)

```ts
export interface AssetImage {
  index: number;
  type: string;          // "screenshot" | "youtube" | ...
  imageUrl: string;      // full-res, absolute https
  thumbnailUrl: string;  // thumb, absolute https
}

export interface AssetPrice {
  isFree: boolean;
  finalPrice: string | null;     // e.g. "32.50"
  originalPrice: string | null;  // e.g. "65.00"
  onSale: boolean;
  discountPercent: number | null;
  currency: string;              // default "USD"
}

export interface Asset {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;    // HTML
  keyFeatures: string | null;    // HTML
  keyImage: string | null;       // hero image, absolute https
  rating: number | null;         // average stars
  ratingCount: number | null;
  reviewCount: number | null;
  publisher: string | null;
  publisherUrl: string | null;
  category: string | null;       // e.g. "Tools/GUI"
  price: AssetPrice;
  downloadSize: string | null;   // human-readable, e.g. "971 KB"
  firstPublishedDate: string | null;
  supportedUnityVersions: string[];
  tags: string[];
  images: AssetImage[];
  fetchedAt: number;             // epoch ms
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(server): add Asset domain types"
```

---

## Task 3: Capture the detail fixture

**Files:**
- Create: `server/tests/fixtures/detail-341308.html`

- [ ] **Step 1: Fetch and save the real product page**

```bash
mkdir -p server/tests/fixtures
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" \
  "https://assetstore.unity.com/packages/p/341308" \
  -o server/tests/fixtures/detail-341308.html
```

- [ ] **Step 2: Verify the fixture contains the hydration payload**

Run: `grep -c 'Product_ProductDetailController' server/tests/fixtures/detail-341308.html`
Expected: ≥ 1.
If the asset 341308 is ever delisted (page 404s), substitute any current asset id from the live site and update the expected values in Task 5's test accordingly.

- [ ] **Step 3: Commit**

```bash
git add server/tests/fixtures/detail-341308.html
git commit -m "test(server): add detail-page fixture (asset 341308)"
```

---

## Task 4: Parser — extract the hydration JSON

**Files:**
- Create: `server/src/parser.ts`
- Test: `server/tests/parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractHydrationJson, ParserError } from '../src/parser.js';

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run tests/parser.test.ts`
Expected: FAIL — cannot find module `../src/parser.js`.

- [ ] **Step 3: Write `server/src/parser.ts` (extraction half)**

```ts
export class ParserError extends Error {
  constructor(message: string) { super(message); this.name = 'ParserError'; }
}

const HYDRATION_ANCHOR = 'window["Product_ProductDetailController"]';
const RENDER_CALL = '.ReactDOMrender(';

/** Find the balanced {...} object starting at `start` (string/escape aware). */
function sliceBalancedObject(s: string, start: number): string {
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < s.length; k++) {
    const c = s[k];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, k + 1); }
  }
  throw new ParserError('unbalanced hydration object — parser needs updating');
}

export function extractHydrationJson(html: string): any {
  const anchor = html.indexOf(HYDRATION_ANCHOR);
  if (anchor === -1) throw new ParserError('hydration anchor not found — parser needs updating');
  const call = html.indexOf(RENDER_CALL, anchor);
  if (call === -1) throw new ParserError('ReactDOMrender call not found — parser needs updating');
  let i = call + RENDER_CALL.length;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== '{') throw new ParserError('expected JSON object argument — parser needs updating');
  const json = sliceBalancedObject(html, i);
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new ParserError(`failed to parse hydration JSON — parser needs updating: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run tests/parser.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/parser.ts server/tests/parser.test.ts
git commit -m "feat(server): extract ReactDOMrender hydration JSON"
```

---

## Task 5: Parser — map product → Asset

**Files:**
- Modify: `server/src/parser.ts`
- Test: `server/tests/parser.test.ts`

- [ ] **Step 1: Add the failing mapper test** (append to `parser.test.ts`)

```ts
import { parseAssetDetail } from '../src/parser.js';

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run tests/parser.test.ts`
Expected: FAIL — `parseAssetDetail` is not exported.

- [ ] **Step 3: Append the mapper to `server/src/parser.ts`**

```ts
import type { Asset, AssetImage, AssetPrice } from './types.js';

function normalizeUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u) return null;
  return u.startsWith('//') ? 'https:' + u : u;
}

function formatBytes(s: unknown): string | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Apollo normalized refs look like { type:"id", id:[TypeName, idStr] }. */
function deref(entity: any, ref: any): any {
  if (ref && ref.type === 'id' && Array.isArray(ref.id)) {
    const [typeName, id] = ref.id;
    return entity?.[typeName]?.[id] ?? null;
  }
  return ref ?? null;
}

export function parseAssetDetail(html: string, id: string): Asset {
  const hydration = extractHydrationJson(html);
  const entity = hydration?.data?.ENTITY;
  const product = entity?.Product?.[id];
  if (!product) throw new ParserError(`product ${id} not in data.ENTITY.Product — parser needs updating`);

  const publisher = deref(entity, product.publisher);
  const category = deref(entity, product.category);
  const tags = Array.isArray(product.popularTags)
    ? product.popularTags.map((t: any) => deref(entity, t)).filter(Boolean)
        .map((t: any) => t.name).filter((n: any): n is string => typeof n === 'string')
    : [];

  const op = product.originalPrice ?? {};
  const price: AssetPrice = {
    isFree: !!op.isFree,
    finalPrice: op.finalPrice ?? null,
    originalPrice: op.originalPrice ?? null,
    onSale: !!(op.discount && Number(op.discount.percentage) > 0),
    discountPercent: op.discount?.percentage ?? null,
    currency: op.currency ?? 'USD',
  };

  const images: AssetImage[] = Array.isArray(product.images)
    ? product.images.map((im: any, idx: number): AssetImage => ({
        index: idx,
        type: im.type ?? 'screenshot',
        imageUrl: normalizeUrl(im.imageUrl) ?? '',
        thumbnailUrl: normalizeUrl(im.thumbnailUrl) ?? normalizeUrl(im.imageUrl) ?? '',
      })).filter((im) => im.imageUrl !== '')
    : [];

  return {
    id: String(product.id),
    slug: product.slug ?? null,
    name: product.name ?? '',
    description: typeof product.description === 'string' ? product.description : null,
    keyFeatures: typeof product.keyFeatures === 'string' ? product.keyFeatures : null,
    keyImage: normalizeUrl(product.mainImage?.big ?? product.mainImage),
    rating: product.rating?.average ?? null,
    ratingCount: product.rating?.count ?? null,
    reviewCount: product.reviewCount ?? null,
    publisher: publisher?.name ?? null,
    publisherUrl: publisher?.url ?? null,
    category: category?.longName ?? category?.name ?? null,
    price,
    downloadSize: formatBytes(product.downloadSize),
    firstPublishedDate: product.firstPublishedDate ?? null,
    supportedUnityVersions: Array.isArray(product.supportedUnityVersions) ? product.supportedUnityVersions : [],
    tags,
    images,
    fetchedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run tests/parser.test.ts`
Expected: PASS (all parser tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/parser.ts server/tests/parser.test.ts
git commit -m "feat(server): map product entity to typed Asset"
```

---

## Task 6: SQLite cache

**Files:**
- Create: `server/src/cache.ts`
- Test: `server/tests/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run tests/cache.test.ts`
Expected: FAIL — cannot find `../src/cache.js`.

- [ ] **Step 3: Write `server/src/cache.ts`**

```ts
import Database from 'better-sqlite3';
import type { Asset } from './types.js';

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );`);
  return db;
}

export function getCachedAsset(db: Db, id: string, maxAgeMs: number): Asset | null {
  const row = db.prepare('SELECT json, fetched_at AS fetchedAt FROM assets WHERE id = ?').get(id) as
    | { json: string; fetchedAt: number } | undefined;
  if (!row) return null;
  if (Date.now() - row.fetchedAt > maxAgeMs) return null;
  return JSON.parse(row.json) as Asset;
}

export function putAsset(db: Db, asset: Asset): void {
  db.prepare(
    `INSERT INTO assets (id, json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
  ).run(asset.id, JSON.stringify(asset), asset.fetchedAt);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run tests/cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/cache.ts server/tests/cache.test.ts
git commit -m "feat(server): SQLite read-through asset cache"
```

---

## Task 7: Fetcher

**Files:**
- Create: `server/src/fetcher.ts`
- Test: `server/tests/fetcher.test.ts`

- [ ] **Step 1: Write the failing test** (uses ASSET_FIXTURE so no network)

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fetchAssetHtml } from '../src/fetcher.js';

const fixture = fileURLToPath(new URL('./fixtures/detail-341308.html', import.meta.url));

describe('fetchAssetHtml', () => {
  afterEach(() => { delete process.env.ASSET_FIXTURE; });

  it('returns fixture HTML when ASSET_FIXTURE is set', async () => {
    process.env.ASSET_FIXTURE = fixture;
    const html = await fetchAssetHtml('341308');
    expect(html).toContain('Product_ProductDetailController');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run tests/fetcher.test.ts`
Expected: FAIL — cannot find `../src/fetcher.js`.

- [ ] **Step 3: Write `server/src/fetcher.ts`**

```ts
import { readFile } from 'node:fs/promises';

const BASE = 'https://assetstore.unity.com/packages/p/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchAssetHtml(id: string): Promise<string> {
  if (process.env.ASSET_FIXTURE) {
    return readFile(process.env.ASSET_FIXTURE, 'utf-8');
  }
  const res = await fetch(BASE + encodeURIComponent(id), {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch failed for asset ${id}: HTTP ${res.status}`);
  return res.text();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run tests/fetcher.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/src/fetcher.ts server/tests/fetcher.test.ts
git commit -m "feat(server): asset HTML fetcher with fixture mode"
```

---

## Task 8: assetService orchestration

**Files:**
- Create: `server/src/assetService.ts`
- Test: `server/tests/assetService.test.ts`

- [ ] **Step 1: Write the failing test** (fixture mode → real parse + cache)

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run tests/assetService.test.ts`
Expected: FAIL — cannot find `../src/assetService.js`.

- [ ] **Step 3: Write `server/src/assetService.ts`**

```ts
import type { Db } from './cache.js';
import { getCachedAsset, putAsset } from './cache.js';
import { fetchAssetHtml } from './fetcher.js';
import { parseAssetDetail } from './parser.js';
import type { Asset } from './types.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export async function getAsset(db: Db, id: string, opts: { force?: boolean } = {}): Promise<Asset> {
  if (!opts.force) {
    const cached = getCachedAsset(db, id, TTL_MS);
    if (cached) return cached;
  }
  const html = await fetchAssetHtml(id);
  const asset = parseAssetDetail(html, id);
  putAsset(db, asset);
  return asset;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run tests/assetService.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/assetService.ts server/tests/assetService.test.ts
git commit -m "feat(server): asset service (cache→fetch→parse)"
```

---

## Task 9: Express routes

**Files:**
- Create: `server/src/routes.ts`
- Test: `server/tests/routes.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake getAsset — no network/db)

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/routes.js';

const fakeAsset = { id: '341308', name: 'Text Animator' } as any;

function app(getAsset: any) {
  return buildApp({} as any, { getAsset });
}

describe('routes', () => {
  it('GET /api/asset/:id returns the asset as JSON', async () => {
    const res = await request(app(async () => fakeAsset)).get('/api/asset/341308');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Text Animator');
  });

  it('rejects a non-numeric id with 400', async () => {
    const res = await request(app(async () => fakeAsset)).get('/api/asset/abc');
    expect(res.status).toBe(400);
  });

  it('maps parser errors to 502', async () => {
    const res = await request(app(async () => { throw new Error('parser needs updating'); }))
      .get('/api/asset/341308');
    expect(res.status).toBe(502);
  });

  it('POST /api/asset/:id/refresh forces a refetch', async () => {
    let forced = false;
    const res = await request(app(async (_db: any, _id: string, opts: any) => { forced = opts?.force; return fakeAsset; }))
      .post('/api/asset/341308/refresh');
    expect(res.status).toBe(200);
    expect(forced).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run tests/routes.test.ts`
Expected: FAIL — cannot find `../src/routes.js`.

- [ ] **Step 3: Write `server/src/routes.ts`**

```ts
import express, { type Express } from 'express';
import type { Db } from './cache.js';
import { getAsset as defaultGetAsset } from './assetService.js';
import type { Asset } from './types.js';

interface Deps {
  getAsset: (db: Db, id: string, opts?: { force?: boolean }) => Promise<Asset>;
}

export function buildApp(db: Db, deps: Deps = { getAsset: defaultGetAsset }): Express {
  const app = express();
  app.use(express.json());

  const send = async (db: Db, id: string, force: boolean, res: express.Response) => {
    try {
      res.json(await deps.getAsset(db, id, { force }));
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg.includes('parser needs updating') ? 502 : 500).json({ error: msg });
    }
  };

  app.get('/api/asset/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    void send(db, req.params.id, req.query.refresh === '1', res);
  });

  app.post('/api/asset/:id/refresh', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    void send(db, req.params.id, true, res);
  });

  return app;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run tests/routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes.ts server/tests/routes.test.ts
git commit -m "feat(server): /api/asset routes with DI for testing"
```

---

## Task 10: Server entry + manual smoke test

**Files:**
- Create: `server/src/server.ts`

- [ ] **Step 1: Write `server/src/server.ts`**

```ts
import 'dotenv/config';
import { openDb } from './cache.js';
import { buildApp } from './routes.js';

const db = openDb(process.env.DB_PATH ?? './data.sqlite');
const app = buildApp(db);
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`asset-mirror server listening on :${port}`));
```

- [ ] **Step 2: Run the whole suite**

Run: `cd server && npx vitest run`
Expected: PASS — all parser/cache/fetcher/assetService/routes tests green.

- [ ] **Step 3: Smoke test against the live site**

Run:
```bash
cd server && (npm run dev &) && sleep 3 && \
  curl -s localhost:8787/api/asset/341308 | head -c 300 ; echo ; kill %1
```
Expected: JSON beginning `{"id":"341308","name":"Text Animator...`.

- [ ] **Step 4: Commit**

```bash
git add server/src/server.ts
git commit -m "feat(server): http entrypoint"
```

---

## Task 11: Frontend scaffold (Vite + Vue + Tailwind v4 + PWA)

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.ts`, `web/src/App.vue`, `web/src/style.css`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "unity-asset-mirror-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview --port 5173",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "dependencies": {
    "dompurify": "^3.2.0",
    "photoswipe": "^5.4.4",
    "vue": "^3.5.0",
    "vue-router": "^4.4.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-vue": "^5.1.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.0",
    "vitest": "^2.1.0",
    "vue-tsc": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `web/vite.config.ts`** (dev-proxy `/api` → backend; PWA)

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Unity Asset Mirror',
        short_name: 'AssetMirror',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [{
          urlPattern: /^https:\/\/assetstorev1-prd-cdn\.unity3d\.com\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'unity-cdn', expiration: { maxEntries: 500, maxAgeSeconds: 604800 } },
        }],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite-plugin-pwa/client"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "e2e"]
}
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Unity Asset Mirror</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/src/style.css`**

```css
@import "tailwindcss";

html, body, #app { height: 100%; }
body { @apply bg-gray-900 text-gray-100; }
```

- [ ] **Step 6: Create `web/src/App.vue`**

```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 7: Create `web/src/main.ts`**

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import './style.css';

createApp(App).use(router).mount('#app');
```

- [ ] **Step 8: Add placeholder PWA icons** (so the build doesn't warn)

Run:
```bash
mkdir -p web/public
# 1x1 transparent PNGs as placeholders; replace with real icons later.
printf '\x89PNG\r\n\x1a\n' > /dev/null  # (use any 192/512 png you have)
```
Place any `pwa-192.png` and `pwa-512.png` into `web/public/`. (Real icons are a polish task; any valid PNG unblocks the build.)

- [ ] **Step 9: Install**

Run: `cd web && npm install`
Expected: success. (Router/views are added in Task 13; `npm run dev` is verified there.)

- [ ] **Step 10: Commit**

```bash
git add web/package.json web/vite.config.ts web/tsconfig.json web/index.html web/src/main.ts web/src/App.vue web/src/style.css web/public
git commit -m "chore(web): scaffold Vue+Vite+Tailwind v4+PWA"
```

---

## Task 12: ID/URL parsing util + API client

**Files:**
- Create: `web/src/ids.ts`, `web/src/api.ts`
- Test: `web/tests/ids.test.ts`
- Modify: `web/vite.config.ts` is unaffected; add a `vitest` config block via `web/vitest.config.ts`

- [ ] **Step 1: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
```

- [ ] **Step 2: Write the failing test `web/tests/ids.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { extractAssetId } from '../src/ids.js';

describe('extractAssetId', () => {
  it('accepts a bare numeric id', () => {
    expect(extractAssetId('341308')).toBe('341308');
  });
  it('extracts the trailing id from a full product url', () => {
    expect(extractAssetId('https://assetstore.unity.com/packages/tools/gui/text-animator-for-unity-...-341308'))
      .toBe('341308');
  });
  it('extracts from a /packages/p/<id> url', () => {
    expect(extractAssetId('https://assetstore.unity.com/packages/p/341308')).toBe('341308');
  });
  it('returns null for junk', () => {
    expect(extractAssetId('hello world')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd web && npx vitest run tests/ids.test.ts`
Expected: FAIL — cannot find `../src/ids.js`.

- [ ] **Step 4: Write `web/src/ids.ts`**

```ts
/** Accept a bare id, a /packages/p/<id> url, or a canonical slug-<id> url. */
export function extractAssetId(input: string): string | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/(?:\/p\/|-)(\d{4,9})(?:[/?#]|$)/);
  return m ? m[1] : null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && npx vitest run tests/ids.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write `web/src/api.ts`**

```ts
import type { } from 'vite/client';

export interface AssetImage { index: number; type: string; imageUrl: string; thumbnailUrl: string; }
export interface AssetPrice { isFree: boolean; finalPrice: string | null; originalPrice: string | null; onSale: boolean; discountPercent: number | null; currency: string; }
export interface Asset {
  id: string; slug: string | null; name: string; description: string | null; keyFeatures: string | null;
  keyImage: string | null; rating: number | null; ratingCount: number | null; reviewCount: number | null;
  publisher: string | null; publisherUrl: string | null; category: string | null; price: AssetPrice;
  downloadSize: string | null; firstPublishedDate: string | null; supportedUnityVersions: string[];
  tags: string[]; images: AssetImage[]; fetchedAt: number;
}

export async function getAsset(id: string): Promise<Asset> {
  const res = await fetch(`/api/asset/${id}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 7: Commit**

```bash
git add web/vitest.config.ts web/tests/ids.test.ts web/src/ids.ts web/src/api.ts
git commit -m "feat(web): id extraction util + API client"
```

---

## Task 13: Router + Open-Asset view

**Files:**
- Create: `web/src/router.ts`, `web/src/views/OpenAsset.vue`, `web/src/views/AssetDetail.vue` (stub here, filled in Task 14)

- [ ] **Step 1: Write `web/src/router.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router';
import OpenAsset from './views/OpenAsset.vue';
import AssetDetail from './views/AssetDetail.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: OpenAsset },
    { path: '/asset/:id', component: AssetDetail, props: true },
  ],
});
```

- [ ] **Step 2: Write `web/src/views/OpenAsset.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { extractAssetId } from '../ids.js';

const input = ref('');
const error = ref('');
const router = useRouter();

function open() {
  const id = extractAssetId(input.value);
  if (!id) { error.value = 'Enter an asset id or store URL'; return; }
  router.push(`/asset/${id}`);
}
</script>

<template>
  <main class="mx-auto max-w-xl p-6 flex flex-col gap-4 min-h-full justify-center">
    <h1 class="text-2xl font-semibold">Unity Asset Mirror</h1>
    <p class="text-gray-400 text-sm">Paste an Asset Store URL or an asset id.</p>
    <form class="flex gap-2" @submit.prevent="open">
      <input v-model="input" placeholder="341308 or https://assetstore.unity.com/…"
             class="flex-1 rounded-lg bg-gray-800 px-4 py-3 outline-none focus:ring-2 ring-indigo-500" />
      <button class="rounded-lg bg-indigo-600 px-5 py-3 font-medium active:scale-95">Open</button>
    </form>
    <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
  </main>
</template>
```

- [ ] **Step 3: Write a temporary `web/src/views/AssetDetail.vue` stub**

```vue
<script setup lang="ts">defineProps<{ id: string }>();</script>
<template><main class="p-6">Asset {{ id }} — coming in Task 14</main></template>
```

- [ ] **Step 4: Verify dev server + navigation**

Run: `cd web && (npm run dev &) && sleep 3 && curl -s localhost:5173 | grep -c 'id="app"'; kill %1`
Expected: `1` (app shell served). Manually: open `localhost:5173`, enter `341308`, submit → URL becomes `/asset/341308` showing the stub.

- [ ] **Step 5: Commit**

```bash
git add web/src/router.ts web/src/views/OpenAsset.vue web/src/views/AssetDetail.vue
git commit -m "feat(web): router + open-asset entry view"
```

---

## Task 14: Asset detail view

**Files:**
- Modify: `web/src/views/AssetDetail.vue`

- [ ] **Step 1: Replace `web/src/views/AssetDetail.vue`**

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import DOMPurify from 'dompurify';
import { getAsset, type Asset } from '../api.js';
import Gallery from '../components/Gallery.vue';

const props = defineProps<{ id: string }>();
const asset = ref<Asset | null>(null);
const error = ref('');
const loading = ref(false);

watchEffect(async () => {
  loading.value = true; error.value = ''; asset.value = null;
  try { asset.value = await getAsset(props.id); }
  catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
});

const clean = (html: string | null) => (html ? DOMPurify.sanitize(html) : '');
</script>

<template>
  <main class="mx-auto max-w-3xl p-4 pb-24">
    <router-link to="/" class="text-indigo-400 text-sm">← Open another</router-link>

    <p v-if="loading" class="mt-8 text-gray-400">Loading…</p>
    <p v-else-if="error" class="mt-8 text-red-400">{{ error }}</p>

    <article v-else-if="asset" class="mt-3 flex flex-col gap-4">
      <h1 class="text-xl font-semibold leading-snug">{{ asset.name }}</h1>
      <div class="text-sm text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
        <span v-if="asset.publisher">{{ asset.publisher }}</span>
        <span v-if="asset.category">· {{ asset.category }}</span>
        <span v-if="asset.rating">· ★ {{ asset.rating }} ({{ asset.reviewCount }})</span>
        <span v-if="asset.downloadSize">· {{ asset.downloadSize }}</span>
      </div>
      <div class="text-lg">
        <template v-if="asset.price.isFree">Free</template>
        <template v-else>
          <span class="font-semibold">${{ asset.price.finalPrice }}</span>
          <span v-if="asset.price.onSale" class="ml-2 text-gray-500 line-through">${{ asset.price.originalPrice }}</span>
        </template>
      </div>

      <Gallery v-if="asset.images.length" :images="asset.images" :alt="asset.name" />

      <section v-if="asset.description">
        <h2 class="text-sm uppercase tracking-wide text-gray-500 mb-1">Description</h2>
        <div class="prose-invert text-sm leading-relaxed" v-html="clean(asset.description)" />
      </section>
      <section v-if="asset.tags.length" class="flex flex-wrap gap-2">
        <span v-for="t in asset.tags" :key="t" class="rounded-full bg-gray-800 px-3 py-1 text-xs">{{ t }}</span>
      </section>
    </article>
  </main>
</template>
```

- [ ] **Step 2: Verify it renders** (Gallery is added next; temporarily this will fail to resolve `Gallery` — that's expected and fixed in Task 15). Skip running until Task 15 Step 4.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/AssetDetail.vue
git commit -m "feat(web): asset detail view with sanitized HTML"
```

---

## Task 15: The PhotoSwipe swipe gallery (centerpiece)

**Files:**
- Create: `web/src/components/Gallery.vue`

Aspect ratios are not in the API, so we capture each thumbnail's natural ratio on load and feed PhotoSwipe correctly-proportioned slide dimensions (so swipe + pinch-zoom behave). Tapping any thumbnail opens PhotoSwipe at that index.

- [ ] **Step 1: Write `web/src/components/Gallery.vue`**

```vue
<script setup lang="ts">
import { ref, reactive } from 'vue';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import type { AssetImage } from '../api.js';

const props = defineProps<{ images: AssetImage[]; alt: string }>();

// ratio[i] = naturalWidth/naturalHeight, captured when a thumbnail loads.
const ratios = reactive<Record<number, number>>({});
const stripEl = ref<HTMLElement | null>(null);

function onThumbLoad(e: Event, i: number) {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) ratios[i] = img.naturalWidth / img.naturalHeight;
}

function openAt(index: number) {
  const W = 1600;
  const lightbox = new PhotoSwipeLightbox({
    dataSource: props.images.map((im, i) => {
      const r = ratios[i] ?? 16 / 9;
      return { src: im.imageUrl, width: W, height: Math.round(W / r), alt: props.alt };
    }),
    pswpModule: () => import('photoswipe'),
    wheelToZoom: true,
  });
  lightbox.init();
  lightbox.loadAndOpen(index);
  lightbox.on('destroy', () => lightbox.destroy());
}
</script>

<template>
  <div ref="stripEl" class="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x snap-mandatory">
    <button v-for="(im, i) in images" :key="im.index" type="button"
            class="snap-start shrink-0 rounded-lg overflow-hidden bg-gray-800 active:scale-95"
            @click="openAt(i)">
      <img :src="im.thumbnailUrl" :alt="alt" loading="lazy"
           class="h-40 w-auto object-cover" @load="onThumbLoad($event, i)" />
    </button>
  </div>
</template>
```

- [ ] **Step 2: Verify build/typecheck**

Run: `cd web && npx vue-tsc -b`
Expected: no type errors.

- [ ] **Step 3: Run frontend unit tests**

Run: `cd web && npx vitest run`
Expected: PASS (ids tests).

- [ ] **Step 4: Manual gallery smoke test** (backend must be running)

Run (two terminals or backgrounded): start `server` (`npm run dev`) and `web` (`npm run dev`), open `localhost:5173`, enter `341308`. Confirm: thumbnail strip is horizontally swipeable; tapping a thumbnail opens fullscreen; swipe left/right moves between images; pinch-zoom works; swipe-down/X closes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Gallery.vue
git commit -m "feat(web): PhotoSwipe swipe/pinch fullscreen gallery"
```

---

## Task 16: PWA install check + Playwright e2e

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/gallery.spec.ts`

The e2e runs the backend in **fixture mode** (deterministic, offline) and the web preview build, then drives the full open→gallery→swipe flow.

- [ ] **Step 1: Write `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', ...devices['iPhone 13'] },
  webServer: [
    {
      command: 'cross-env ASSET_FIXTURE=./tests/fixtures/detail-341308.html PORT=8787 npm run dev',
      cwd: '../server',
      url: 'http://localhost:8787/api/asset/341308',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      cwd: '.',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

(Add `cross-env` to `web` devDependencies: `npm i -D cross-env`.)

- [ ] **Step 2: Write the failing test `web/e2e/gallery.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('open an asset and swipe its gallery', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/341308/).fill('341308');
  await page.getByRole('button', { name: 'Open' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Text Animator');

  // open the fullscreen gallery
  await page.locator('button:has(img)').first().click();
  const pswp = page.locator('.pswp');
  await expect(pswp).toBeVisible();

  // advance to the next image via the PhotoSwipe next button
  await page.locator('.pswp__button--arrow--next').click();
  await expect(pswp).toBeVisible();

  // close
  await page.locator('.pswp__button--close').click();
  await expect(pswp).toHaveCount(0);
});
```

- [ ] **Step 3: Install browsers and run**

Run: `cd web && npm i -D cross-env && npx playwright install chromium && npx playwright test`
Expected: 1 passed.

- [ ] **Step 4: Verify the PWA builds and is installable**

Run: `cd web && npm run build && npm run preview &` then load `localhost:5173`, confirm DevTools → Application shows a registered service worker + manifest (installable). Kill preview after.

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/e2e/gallery.spec.ts web/package.json
git commit -m "test(web): e2e open→gallery→swipe flow + PWA check"
```

---

## Done — what this delivers

A working, installable mobile app: open any asset by id or pasted URL → full asset page → **swipe/pinch fullscreen gallery**. Backend parses live Asset Store pages and caches them in SQLite (24h), with a fixture mode for deterministic tests/offline dev. The parser fails loudly ("parser needs updating" → HTTP 502) if Unity changes the page shape.

**Not in this plan (later plans):** search/browse (needs the Coveo spike), account/owned/wishlist, tags/collections. The single `assets(id, json, fetched_at)` cache table is intentionally minimal (YAGNI); the normalized schema from the spec arrives when search/browse needs to query across assets.

## Self-review notes

- **Spec coverage:** detail fetch+parse+cache (§5,§6,§7), `/api/asset/:id` + refresh (§9), gallery (§10.1), PWA (§10), parser-resilience loud failure (§13), fixture-based parser tests (§13). Search/account/personal-layer are explicitly deferred to their own plans per §15.
- **Type consistency:** `Asset`/`AssetImage`/`AssetPrice` identical in `server/src/types.ts` and `web/src/api.ts`; `getAsset(db,id,{force})`, `extractHydrationJson`, `parseAssetDetail`, `extractAssetId`, `openDb/getCachedAsset/putAsset`, `buildApp(db,deps)` names are used consistently across tasks.
- **No placeholders:** every step has runnable code/commands and expected output. The only deferred polish is real PWA icons (any valid PNG unblocks the build) and exact-pixel zoom (aspect ratios are captured from thumbnails).
