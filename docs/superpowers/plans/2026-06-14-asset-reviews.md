# Asset Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an asset's reviews on its page (sortable, paginated, with publisher replies) and expose them as clean JSON at `GET /api/asset/:id/reviews` for the user's marketing agent.

**Architecture:** Reviews are server-rendered anonymously by Unity at `/packages/p/{id}/reviews?page=&sort_by=`. The page hydrates via `window["Product_ReviewController"].ReactDOMrender({…})` — the SAME mechanism as the detail page but a different controller — so we generalize `extractHydrationJson` to be controller-agnostic, parse `data.ENTITY.Product[id].reviews(…)` (deref `Comment` + `ConnectUserProfile`; replies are refs to other `Comment`s), and serve a typed `ReviewsResponse`. A new `Reviews.vue` renders it on the asset page.

**Tech Stack:** Express + TS + Vitest + supertest (backend), Vue 3 + Vite + Tailwind + Playwright (frontend).

**Grounding (verified live 2026-06-14, asset 341308 — 170 reviews / 17 pages):**
`GET https://assetstore.unity.com/packages/p/{id}/reviews?page={1..lastPage}&sort_by={recent|helpful|rating}` (follow the 301; normal UA; anonymous). Hydration JSON `data.ENTITY`:
- `Product[id]` has a key starting `reviews(` → `{ count, total_entries, last_page, comments:[ {type:"id",id:["Comment",cid]} … ] }`
- `Comment[cid]` → `{ id, date, rating(number), user:<ref>, is_helpful:{count:"6",score:"6"} (STRINGS), subject, version, full, replies:[ <ref to Comment> … ], … }`
- `ConnectUserProfile[uid]` → `{ id, name, … }`
- A reply is a ref to another `Comment` (the publisher's reply: has `user`, `date`, `full`).

**E2E fixture env:** add `REVIEWS_FIXTURE=<path>` (mirrors `ASSET_FIXTURE`) so the reviews fetch is deterministic/offline in tests.

---

## File Structure

```
server/src/
  types.ts          # + Review, ReviewReply, ReviewsResponse
  parser.ts         # extractHydrationJson → controller-agnostic; + parseReviews()
  fetcher.ts        # + fetchReviewsHtml(id, sortBy, page) (+ REVIEWS_FIXTURE mode)
  reviewsService.ts # NEW: getReviews(id, {sort, page})
  routes.ts         # + GET /api/asset/:id/reviews (DI)
server/tests/
  fixtures/reviews-341308.html  # NEW (captured; contains a review with a reply)
  parser.test.ts        # + extractHydrationJson works on reviews fixture; + parseReviews
  reviewsService.test.ts# NEW
  routes.test.ts        # + reviews route
web/src/
  api.ts            # + Review/ReviewReply/ReviewsResponse + getReviews()
  components/Reviews.vue   # NEW
  views/AssetDetail.vue    # mount <Reviews>
web/
  playwright.config.ts     # + REVIEWS_FIXTURE in the backend command
  e2e/reviews.spec.ts      # NEW
```

---

## Task 1: Review types

**Files:** Modify `server/src/types.ts`

- [ ] **Step 1: Append to `server/src/types.ts`**

```ts
export interface ReviewReply {
  author: string | null;
  date: string | null;
  body: string;
}

export interface Review {
  id: string;
  rating: number | null;     // 1–5
  title: string;
  body: string;
  author: string | null;
  date: string | null;       // ISO
  version: string | null;    // asset version reviewed
  helpfulCount: number;
  helpfulScore: number;
  replies: ReviewReply[];    // publisher (and other) replies
}

export interface ReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
  pageSize: number;          // 10 (Unity-fixed)
  lastPage: number;
  sort: string;              // helpful | recent | rating
}
```

- [ ] **Step 2: Verify** — Run: `cd server && npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(server): add review domain types"
```

---

## Task 2: Capture the reviews fixture

**Files:** Create `server/tests/fixtures/reviews-341308.html`

- [ ] **Step 1: Fetch the helpful-sorted reviews page** (it contains at least one review with a publisher reply)

```bash
curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" \
  "https://assetstore.unity.com/packages/p/341308/reviews?page=1&sort_by=helpful" \
  -o server/tests/fixtures/reviews-341308.html
```

- [ ] **Step 2: Verify it has reviews + a reply**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('server/tests/fixtures/reviews-341308.html','utf8');console.log('ReviewController:', h.includes('Product_ReviewController'));console.log('total_entries:', h.includes('total_entries'));console.log('has a non-empty replies array:', /\"replies\":\[\{/.test(h));"
```
Expected: `true`, `true`, `true`. If the replies check is false (Unity reordered reviews), the parser tests still pass via the synthetic reply test in Task 4; recapture later if you want real-reply fixture coverage.

- [ ] **Step 3: Commit**

```bash
git add server/tests/fixtures/reviews-341308.html
git commit -m "test(server): capture reviews-page fixture (asset 341308)"
```

---

## Task 3: Make `extractHydrationJson` controller-agnostic

**Files:** Modify `server/src/parser.ts`; Test `server/tests/parser.test.ts`

The reviews page uses `Product_ReviewController` (not `Product_ProductDetailController`), but the same `.ReactDOMrender({…})` call. Anchor on that call instead of the controller name (each page has exactly one).

- [ ] **Step 1: Add a failing test** (append to `parser.test.ts`)

```ts
const reviewsHtml = readFileSync(new URL('./fixtures/reviews-341308.html', import.meta.url), 'utf-8');

describe('extractHydrationJson is controller-agnostic', () => {
  it('extracts the hydration JSON from the reviews page too', () => {
    const data = extractHydrationJson(reviewsHtml);
    expect(data?.data?.ENTITY?.Product?.['341308']).toBeTruthy();
    expect(data.data.ENTITY.Comment).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/parser.test.ts -t "controller-agnostic"` — Expected: FAIL (current anchor is `Product_ProductDetailController`, absent on the reviews page → `ParserError`).

- [ ] **Step 3: Edit `server/src/parser.ts`** — replace the `extractHydrationJson` anchor logic

Replace:
```ts
const HYDRATION_ANCHOR = 'window["Product_ProductDetailController"]';
const RENDER_CALL = '.ReactDOMrender(';
```
with:
```ts
const RENDER_CALL = '.ReactDOMrender(';
```
And replace the body of `extractHydrationJson` up to the `sliceBalancedObject` call with:
```ts
export function extractHydrationJson(html: string): any {
  // Both the detail page (Product_ProductDetailController) and the reviews page
  // (Product_ReviewController) hydrate via a single `.ReactDOMrender({...})` call.
  const call = html.indexOf(RENDER_CALL);
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

- [ ] **Step 4: Run the whole parser suite** — Run: `cd server && npx vitest run tests/parser.test.ts` — Expected: PASS (the new test AND all existing detail-parser tests — the detail page still has exactly one `.ReactDOMrender(`).

- [ ] **Step 5: Commit**

```bash
git add server/src/parser.ts server/tests/parser.test.ts
git commit -m "feat(server): make extractHydrationJson controller-agnostic (detail + reviews pages)"
```

---

## Task 4: `parseReviews`

**Files:** Modify `server/src/parser.ts`, `server/tests/parser.test.ts`

- [ ] **Step 1: Add failing tests** (append to `parser.test.ts`)

```ts
import { parseReviews } from '../src/parser.js';

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
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/parser.test.ts -t parseReviews` — Expected: FAIL (`parseReviews` not exported).

- [ ] **Step 3: Append `parseReviews` to `server/src/parser.ts`** (reuses the existing private `deref` + `extractHydrationJson`)

```ts
import type { Review, ReviewReply, ReviewsResponse } from './types.js';

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseReviews(html: string, id: string, sort: string, page: number): ReviewsResponse {
  const hydration = extractHydrationJson(html);
  const entity = hydration?.data?.ENTITY;
  const product = entity?.Product?.[id];
  if (!product) throw new ParserError(`product ${id} not in data.ENTITY.Product — review parser needs updating`);
  const key = Object.keys(product).find((k) => k.startsWith('reviews('));
  if (!key) throw new ParserError(`reviews(...) block not found on product ${id} — review parser needs updating`);
  const meta = product[key] ?? {};
  const refs: any[] = Array.isArray(meta.comments) ? meta.comments : [];

  const nameOf = (userRef: any): string | null => {
    const u = deref(entity, userRef);
    return u && typeof u.name === 'string' && u.name ? u.name : null;
  };
  const mapReply = (ref: any): ReviewReply | null => {
    const rc = deref(entity, ref); // a Comment entity (the reply)
    if (!rc) return null;
    return { author: nameOf(rc.user), date: rc.date ?? null, body: rc.full ?? '' };
  };

  const reviews: Review[] = refs
    .map((ref) => deref(entity, ref))
    .filter(Boolean)
    .map((c: any): Review => ({
      id: String(c.id ?? ''),
      rating: typeof c.rating === 'number' ? c.rating : null,
      title: c.subject ?? '',
      body: c.full ?? '',
      author: nameOf(c.user),
      date: c.date ?? null,
      version: c.version ?? null,
      helpfulCount: toNum(c.is_helpful?.count),
      helpfulScore: toNum(c.is_helpful?.score),
      replies: Array.isArray(c.replies) ? c.replies.map(mapReply).filter((x): x is ReviewReply => x !== null) : [],
    }));

  return { reviews, total: toNum(meta.total_entries), page, pageSize: 10, lastPage: toNum(meta.last_page), sort };
}
```

- [ ] **Step 4: Run** — Run: `cd server && npx vitest run tests/parser.test.ts && npx tsc --noEmit` — Expected: PASS + clean.
- [ ] **Step 5: Commit**

```bash
git add server/src/parser.ts server/tests/parser.test.ts
git commit -m "feat(server): parse reviews (comments + replies + pagination)"
```

---

## Task 5: `fetchReviewsHtml`

**Files:** Modify `server/src/fetcher.ts`; Test `server/tests/fetcher.test.ts`

- [ ] **Step 1: Add failing test** (append to `fetcher.test.ts`)

```ts
import { fetchReviewsHtml } from '../src/fetcher.js';
const reviewsFixture = fileURLToPath(new URL('./fixtures/reviews-341308.html', import.meta.url));

describe('fetchReviewsHtml', () => {
  afterEach(() => { delete process.env.REVIEWS_FIXTURE; });
  it('returns fixture HTML when REVIEWS_FIXTURE is set', async () => {
    process.env.REVIEWS_FIXTURE = reviewsFixture;
    const html = await fetchReviewsHtml('341308', 'helpful', 1);
    expect(html).toContain('Product_ReviewController');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/fetcher.test.ts -t fetchReviewsHtml` — Expected: FAIL (not exported).

- [ ] **Step 3: Append to `server/src/fetcher.ts`** (reuse the existing `UA` constant and `readFile` import)

```ts
const REVIEWS_BASE = 'https://assetstore.unity.com/packages/p/';

export async function fetchReviewsHtml(id: string, sortBy: string, page: number): Promise<string> {
  if (process.env.REVIEWS_FIXTURE) {
    return readFile(process.env.REVIEWS_FIXTURE, 'utf-8');
  }
  const url = `${REVIEWS_BASE}${encodeURIComponent(id)}/reviews?page=${encodeURIComponent(String(page))}&sort_by=${encodeURIComponent(sortBy)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch failed for reviews ${id}: HTTP ${res.status}`);
  return res.text();
}
```

- [ ] **Step 4: Run** — Run: `cd server && npx vitest run tests/fetcher.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add server/src/fetcher.ts server/tests/fetcher.test.ts
git commit -m "feat(server): reviews HTML fetcher with fixture mode"
```

---

## Task 6: `reviewsService`

**Files:** Create `server/src/reviewsService.ts`; Test `server/tests/reviewsService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { getReviews } from '../src/reviewsService.js';
const fixture = fileURLToPath(new URL('./fixtures/reviews-341308.html', import.meta.url));

describe('getReviews', () => {
  beforeEach(() => { process.env.REVIEWS_FIXTURE = fixture; });
  afterEach(() => { delete process.env.REVIEWS_FIXTURE; });

  it('defaults to helpful sort and page 1, returns mapped reviews', async () => {
    const r = await getReviews('341308');
    expect(r.sort).toBe('helpful');
    expect(r.page).toBe(1);
    expect(r.reviews.length).toBeGreaterThan(0);
  });
  it('rejects an unknown sort (falls back to helpful) and clamps page to >= 1', async () => {
    const r = await getReviews('341308', { sort: 'bogus', page: 0 });
    expect(r.sort).toBe('helpful');
    expect(r.page).toBe(1);
  });
  it('passes through valid sort + page', async () => {
    const r = await getReviews('341308', { sort: 'recent', page: 3 });
    expect(r.sort).toBe('recent');
    expect(r.page).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/reviewsService.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Write `server/src/reviewsService.ts`**

```ts
import { fetchReviewsHtml } from './fetcher.js';
import { parseReviews } from './parser.js';
import type { ReviewsResponse } from './types.js';

const SORTS = new Set(['helpful', 'recent', 'rating']);

export interface ReviewParams { sort?: string; page?: number; }

export async function getReviews(id: string, p: ReviewParams = {}): Promise<ReviewsResponse> {
  const sort = SORTS.has(p.sort ?? '') ? (p.sort as string) : 'helpful';
  const page = Math.max(1, Math.floor(p.page ?? 1));
  const html = await fetchReviewsHtml(id, sort, page);
  return parseReviews(html, id, sort, page);
}
```

- [ ] **Step 4: Run** — Run: `cd server && npx vitest run tests/reviewsService.test.ts` — Expected: PASS (3).
- [ ] **Step 5: Commit**

```bash
git add server/src/reviewsService.ts server/tests/reviewsService.test.ts
git commit -m "feat(server): reviews service (sort default/clamp + fetch/parse)"
```

---

## Task 7: `GET /api/asset/:id/reviews`

**Files:** Modify `server/src/routes.ts`, `server/tests/routes.test.ts`

- [ ] **Step 1: Add failing tests** (append to `routes.test.ts`)

```ts
import { getReviews as realGetReviews } from '../src/reviewsService.js';

describe('reviews route', () => {
  const okReviews = { reviews: [{ id: '1', title: 'X' }], total: 5, page: 1, pageSize: 10, lastPage: 1, sort: 'helpful' } as any;
  function revApp(getReviews: any) {
    return buildApp({} as any, { getAsset: async () => ({} as any), search: realSearch, getCategories: realCats, getReviews });
  }
  it('GET /api/asset/:id/reviews forwards sort+page and returns JSON', async () => {
    let seen: any;
    const res = await request(revApp(async (id: string, p: any) => { seen = { id, ...p }; return okReviews; }))
      .get('/api/asset/341308/reviews?sort=recent&page=2');
    expect(res.status).toBe(200);
    expect(res.body.reviews[0].title).toBe('X');
    expect(seen).toMatchObject({ id: '341308', sort: 'recent', page: 2 });
  });
  it('rejects a non-numeric id with 400', async () => {
    const res = await request(revApp(async () => okReviews)).get('/api/asset/abc/reviews');
    expect(res.status).toBe(400);
  });
  it('maps a parser failure to 502', async () => {
    const res = await request(revApp(async () => { throw new Error('review parser needs updating'); }))
      .get('/api/asset/341308/reviews');
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd server && npx vitest run tests/routes.test.ts -t "reviews route"` — Expected: FAIL (`buildApp` `Deps` has no `getReviews`).

- [ ] **Step 3: Edit `server/src/routes.ts`**

Add to the imports:
```ts
import { getReviews as defaultGetReviews } from './reviewsService.js';
import type { ReviewsResponse } from './types.js';
```
Add to the `Deps` interface:
```ts
  getReviews: (id: string, opts?: { sort?: string; page?: number }) => Promise<ReviewsResponse>;
```
Add `getReviews: defaultGetReviews` to the `buildApp` default deps object. Then add this handler before `return app;`:
```ts
  app.get('/api/asset/:id/reviews', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const page = Number(req.query.page ?? 1) || 1;
    deps.getReviews(req.params.id, { sort, page })
      .then((r) => res.json(r))
      .catch((e) => res.status(/parser needs updating/.test((e as Error).message) ? 502 : 500).json({ error: (e as Error).message }));
  });
```
(Update the existing `searchApp`/`app` test helpers in `routes.test.ts` that call `buildApp` to also pass `getReviews: realGetReviews` in their base deps if TypeScript complains about the missing property — the asset/search helpers' base deps object must include it.)

- [ ] **Step 4: Run** — Run: `cd server && npx vitest run tests/routes.test.ts && npx tsc --noEmit` — Expected: PASS + clean.
- [ ] **Step 5: Commit**

```bash
git add server/src/routes.ts server/tests/routes.test.ts
git commit -m "feat(server): GET /api/asset/:id/reviews route"
```

---

## Task 8: Backend full suite + live smoke

- [ ] **Step 1: Full suite** — Run: `cd server && npx vitest run && npx tsc --noEmit` — Expected: all PASS, clean.
- [ ] **Step 2: Live smoke**

Run: `cd server && (npm run dev &) && sleep 3 && curl -s "localhost:8787/api/asset/341308/reviews?sort=helpful" | python3 -c "import sys,json;d=json.load(sys.stdin);print('total',d['total'],'lastPage',d['lastPage'],'first:',d['reviews'][0]['title'])"; kill %1`
Expected: `total <n> lastPage <n> first: <title>`. (If 8787 is busy, skip — the fixture suite is the gate.)

- [ ] **Step 3:** No commit (verification only).

---

## Task 9: Web API client — reviews

**Files:** Modify `web/src/api.ts`

- [ ] **Step 1: Append to `web/src/api.ts`**

```ts
export interface ReviewReply { author: string | null; date: string | null; body: string; }
export interface Review {
  id: string; rating: number | null; title: string; body: string; author: string | null;
  date: string | null; version: string | null; helpfulCount: number; helpfulScore: number; replies: ReviewReply[];
}
export interface ReviewsResponse { reviews: Review[]; total: number; page: number; pageSize: number; lastPage: number; sort: string; }

export async function getReviews(id: string, sort: string, page: number): Promise<ReviewsResponse> {
  const res = await fetch(`/api/asset/${id}/reviews?sort=${encodeURIComponent(sort)}&page=${page}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add web/src/api.ts
git commit -m "feat(web): reviews API client"
```

---

## Task 10: `Reviews.vue`

**Files:** Create `web/src/components/Reviews.vue`

- [ ] **Step 1: Write `web/src/components/Reviews.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getReviews, type Review } from '../api.js';

const props = defineProps<{ assetId: string; rating: number | null; reviewCount: number | null }>();

const sort = ref<'helpful' | 'recent' | 'rating'>('helpful');
const reviews = ref<Review[]>([]);
const total = ref(0); const lastPage = ref(1); const page = ref(1);
const loading = ref(false); const error = ref('');

async function load(reset: boolean) {
  if (loading.value) return;
  loading.value = true; error.value = '';
  if (reset) { page.value = 1; reviews.value = []; }
  try {
    const r = await getReviews(props.assetId, sort.value, page.value);
    reviews.value = reset ? r.reviews : [...reviews.value, ...r.reviews];
    total.value = r.total; lastPage.value = r.lastPage;
  } catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
}
function setSort(s: 'helpful' | 'recent' | 'rating') { if (s !== sort.value) { sort.value = s; load(true); } }
function loadMore() { if (page.value < lastPage.value && !loading.value) { page.value += 1; load(false); } }
onMounted(() => load(true));

const stars = (n: number | null) => '★'.repeat(n ?? 0) + '☆'.repeat(Math.max(0, 5 - (n ?? 0)));
const day = (d: string | null) => (d ? d.slice(0, 10) : '');
const sortLabel = { helpful: 'Most helpful', recent: 'Recent', rating: 'Rating' } as const;
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm uppercase tracking-wide text-gray-500">
        Reviews <span v-if="rating" class="text-amber-400">★ {{ rating }}</span>
        <span v-if="reviewCount" class="text-gray-500">({{ reviewCount.toLocaleString() }})</span>
      </h2>
      <div class="flex gap-1">
        <button v-for="s in (['helpful','recent','rating'] as const)" :key="s" type="button" @click="setSort(s)"
                :class="`rounded-full px-3 py-1 text-xs active:scale-95 ${sort === s ? 'bg-indigo-600' : 'bg-gray-800'}`">
          {{ sortLabel[s] }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

    <article v-for="r in reviews" :key="r.id" class="rounded-lg bg-gray-800/50 p-3 flex flex-col gap-1">
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="text-amber-400">{{ stars(r.rating) }}</span>
        <span class="text-gray-500 text-xs">👍 {{ r.helpfulCount }}</span>
      </div>
      <div class="font-medium">{{ r.title }}</div>
      <div class="text-xs text-gray-400">{{ r.author }} · {{ day(r.date) }}<span v-if="r.version"> · v{{ r.version }}</span></div>
      <p class="text-sm whitespace-pre-line leading-relaxed break-words">{{ r.body }}</p>
      <div v-for="(rep, idx) in r.replies" :key="idx" class="mt-1 ml-3 border-l-2 border-gray-700 pl-3">
        <div class="text-xs text-indigo-300">↳ {{ rep.author }} (publisher) · {{ day(rep.date) }}</div>
        <p class="text-sm whitespace-pre-line leading-relaxed break-words text-gray-300">{{ rep.body }}</p>
      </div>
    </article>

    <p v-if="loading" class="py-2 text-center text-gray-400 text-sm">Loading…</p>
    <button v-if="!loading && page < lastPage" type="button" @click="loadMore"
            class="self-center rounded-lg bg-gray-800 px-4 py-2 text-sm active:scale-95">
      Load more reviews ({{ (total - reviews.length).toLocaleString() }} more)
    </button>
    <p v-if="!loading && !error && !reviews.length" class="text-gray-500 text-sm">No reviews yet.</p>
  </section>
</template>
```

- [ ] **Step 2: Typecheck** — Run: `cd web && npx vue-tsc -b` — Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add web/src/components/Reviews.vue
git commit -m "feat(web): Reviews component (sort, load-more, publisher replies)"
```

---

## Task 11: Mount Reviews on the asset page + e2e

**Files:** Modify `web/src/views/AssetDetail.vue`, `web/playwright.config.ts`; Create `web/e2e/reviews.spec.ts`

- [ ] **Step 1: Mount `<Reviews>` in `AssetDetail.vue`**

Add the import in `<script setup>`:
```ts
import Reviews from '../components/Reviews.vue';
```
And add the component after the Key Features `</section>` (before the tags section) in the template:
```vue
      <Reviews :asset-id="props.id" :rating="asset.rating" :review-count="asset.reviewCount" />
```

- [ ] **Step 2: Add `REVIEWS_FIXTURE` to the Playwright backend command** in `web/playwright.config.ts`

Update the backend `webServer` command to include the reviews fixture so the Reviews component's fetch is deterministic in all e2e (including the existing gallery test, which now also mounts Reviews):
```ts
command: 'ASSET_FIXTURE=./tests/fixtures/detail-341308.html COVEO_FIXTURE_DIR=./tests/fixtures REVIEWS_FIXTURE=./tests/fixtures/reviews-341308.html PORT=8787 node_modules/.bin/tsx src/server.ts',
```
(keep `cwd: '../server'`, `url`, etc. unchanged; match whatever runner the existing command uses — the prior tasks used `node_modules/.bin/tsx src/server.ts`.)

- [ ] **Step 3: Write `web/e2e/reviews.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('asset page shows reviews; sort + load-more work', async ({ page }) => {
  await page.goto('/asset/341308');
  const section = page.getByRole('heading', { name: /Reviews/ });
  await expect(section).toBeVisible();
  // at least one review article renders (10 from the fixture)
  const reviews = page.locator('article:has(p)');
  await expect(reviews.first()).toBeVisible();
  const before = await reviews.count();
  // load more appends (fixture returns 10 each page; lastPage > 1)
  await page.getByRole('button', { name: /Load more reviews/ }).click();
  await expect.poll(async () => reviews.count()).toBeGreaterThan(before);
  // switching sort keeps the section populated
  await page.getByRole('button', { name: 'Recent', exact: true }).click();
  await expect(reviews.first()).toBeVisible();
});
```

- [ ] **Step 4: Run the full e2e** — Run: `cd web && npx playwright test` — Expected: all pass (gallery + search + the new reviews spec). Ports 8787/5173 must be free.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/AssetDetail.vue web/playwright.config.ts web/e2e/reviews.spec.ts
git commit -m "feat(web): reviews section on asset page + e2e"
```

---

## Task 12: Final verification

- [ ] **Step 1: Backend** — Run: `cd server && npx vitest run && npx tsc --noEmit` — Expected: green + clean.
- [ ] **Step 2: Frontend** — Run: `cd web && npx vitest run && npx vue-tsc -b && npx playwright test && npm run build` — Expected: green + clean + built.
- [ ] **Step 3: Live manual** — with both servers running, open an asset: the Reviews section shows the aggregate, a sorted list (helpful default), replies under reviews that have them, and Load more pages through. (No commit.)

---

## Done — what this delivers

The asset page gains a Reviews section (sortable helpful/recent/rating, paginated, publisher replies inline), and `GET /api/asset/:id/reviews` returns clean JSON for the marketing agent. Parsing reuses the (now controller-agnostic) hydration extractor; reviews are anonymous SSR parses with loud 502s on shape changes.

**Deferred (anonymous limits):** per-star distribution and server-side rating filter (need a logged-in session) — see the spec Non-Goals.

## Self-Review

- **Spec coverage:** endpoint + types (Tasks 1,7,9), recipe/parse incl. replies (Tasks 3,4), sort default helpful + clamp (Task 6), fetch + fixture mode (Task 5), Reviews UI with aggregate/sort/load-more/replies (Tasks 10,11), agent JSON surface (Task 7), fixture-backed tests + e2e (Tasks 2,4,11). Deferred items match the spec Non-Goals.
- **Type consistency:** `Review`/`ReviewReply`/`ReviewsResponse` identical in `server/src/types.ts` and `web/src/api.ts`; `getReviews(id,{sort,page})`, `parseReviews(html,id,sort,page)`, `fetchReviewsHtml(id,sortBy,page)`, `extractHydrationJson`, `deref` used consistently; `Deps` extended with `getReviews` and all `buildApp` call sites updated.
- **No placeholders:** every step has runnable code/commands + expected output; the reply-mapping path is covered by a deterministic synthetic test in addition to the live fixture.
