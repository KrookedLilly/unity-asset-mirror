# Search & Browse — Design Spec

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 of the Unity Asset Mirror roadmap (follows the Detail + Gallery MVP)
**Builds on:** `2026-06-13-unity-asset-mirror-design.md`

## 1. Summary

Add keyword search and category browsing to Unity Asset Mirror. A unified, mobile-first
**Browse** screen becomes the app's home: a search box, sort, a category sheet, and
Free/On-Sale quick-filters all narrow one results list; tapping a result opens the
existing asset detail page + gallery. Search is powered by Unity's Coveo backend, which a
reverse-engineering spike proved is reachable **anonymously** server-side.

## 2. Goals

- Find assets by **keyword**, browse by **category**, **sort**, and filter by **Free** /
  **On-Sale** — on one mobile-first surface.
- Results deep-link into the existing detail/gallery page (Coveo's `permanentid` is the
  same numeric id our `/api/asset/:id` already uses).
- Fold the existing "open by id/URL" flow into the search box (smart detection).
- Never show a blank screen — empty query shows a default **Popular** listing.

## 3. Non-Goals (v1)

- **No full facet rail** (publisher filter, price-range buckets, rating buckets with live
  counts) — deferred. v1 ships keyword + category + sort + Free/On-Sale.
- No account-aware features (owned/wishlist badges, hide-owned) — that's the next phase.
- No personal layer (tags/collections).
- No write actions to Unity.

## 4. Locked Decisions

| Decision | Choice |
| --- | --- |
| Scope | Search + category browse (+ sort + Free/On-Sale) |
| Layout | Unified browse surface (search + category + filters narrow one list) |
| Result card | **1-column list rows** |
| Categories | **Dynamic** — built from Coveo category facet, cached |
| Open-by-id | **Folded into the search box** (smart id/URL detection) |
| Empty state | Default **Popular** listing |
| Token | Anonymous Coveo search token, cached in-memory, auto-refreshed |

## 5. Verified Coveo recipe (spike, 2026-06-14)

Proven with live requests. **No Unity login / cookie required.**

**Step 1 — mint token (anonymous):**
```
GET https://assetstore.unity.com/api/coveo/search-token?searchHub=Assetstore_Search
Header: x-client-id: compass-ui
→ a quoted JWT string (strip the outer quotes). TTL 24h.
```
Hubs: `Assetstore_Search` (keyword search), `Assetstore_Listing` (category browse).

**Step 2 — search:**
```
POST https://unitytechnologiesproductionmkahteav.org.coveo.com/rest/search/v2?organizationId=unitytechnologiesproductionmkahteav
Headers: Authorization: Bearer <token> ; Content-Type: application/json
Body: {
  "q": "<keywords>",
  "numberOfResults": 24,
  "firstResult": <0-based offset>,
  "sortCriteria": "relevancy",
  "searchHub": "Assetstore_Search",
  "aq": "<filter expression, optional>",
  "context": { "userGroups": "assetStoreUsers" }   // MANDATORY — omitting returns 0 results
}
```

**Sort criteria** (UI → Coveo): relevance→`relevancy` · price asc→`@ec_price_filter ascending` ·
price desc→`@ec_price_filter descending` · rating→`@ec_rating_sort descending` ·
newest→`@first_published_at descending` · popular→`@ec_best_selling_score_last_year descending`.

**Filter expressions (`aq`, AND-combined):** category→`@ec_category_level1=="<slug>"` ·
subcategory→`@ec_category_level2=="<slug>"` · free→`@ec_price==0` · on-sale→`@ec_sale_filters==on_sale`.

**Per-result fields** (under `result.raw`): `permanentid` (numeric asset id — same as our
detail id) · `ec_name` · `ec_price` (list price) · `ec_price_filter` (effective/sale price) ·
`ec_sale_filters` (`["on_sale"]`…) · `ec_sale_discount_percentage_filter` (0.5 = 50%) ·
`ec_thumbnails` (CDN thumb URL) · `ec_rating` · `ec_rating_count` · `publisher_name` ·
`ec_category_level1` / `ec_category_level2`. Response also has `totalCount`.

**Categories:** a facet query (`numberOfResults: 0`, facet on `ec_category_level1`) returns
top categories with counts; level-2 subcategories come from a facet on `ec_category_level2`
constrained by the selected level-1 via `aq`.

**Token lifecycle:** 24h JWT, anonymous, claims include `userGroups:["assetStoreUsers"]`.
Refresh when within ~5 min of `exp`.

## 6. UX — the Browse screen (home)

```
┌──────────────────────┐
│ 🔍 search…       [⇅]  │  sort menu (Relevance ▾)
│ [All categories ▾]   │  → category sheet (top cats → subcats), dynamic
│  ◦ Free   ◦ On-Sale  │  quick-filter toggles
├──────────────────────┤
│ ┌────┐ Asset Name    │  list row: thumb · name · publisher · ★rating · price (strike if sale)
│ │img │ Publisher      │
│ └────┘ ★4.8  $32 $̶6̶5̶  │
│ … infinite scroll …  │  IntersectionObserver loads next page
└──────────────────────┘
```

- **Smart search box:** if the input parses as an asset id or Asset Store URL
  (reuse `extractAssetId`), show an **"Open asset <id> →"** shortcut that routes straight to
  `/asset/:id`; otherwise keyword-search on submit. This replaces the standalone OpenAsset view.
- **Empty query → Popular** (sort = best-selling) so the screen is never blank.
- Tap a result → `/asset/:id` (existing detail + gallery).
- Sort, category, and Free/On-Sale all re-issue the search from `firstResult: 0`.

## 7. Backend architecture (extends the existing units)

- **`coveo.ts`** — owns the Coveo seam. `getSearchToken(hub)`: mint + **in-memory cache**
  per hub, refresh ~5 min before `exp`. `coveoSearch(body)`: POST to the org endpoint with
  the bearer token; on a 401/expired-token response, refresh once and retry.
- **`searchService.ts`** — translates UI params → a Coveo body (q, `firstResult`, `numberOfResults`,
  `sortCriteria`, `aq` from filters, `context.userGroups`), calls `coveo.ts`, and maps each
  hit → a lean `SearchResult`. Also `getCategories()` (facet query → category tree).
- **Endpoints (in `routes.ts`):**
  - `GET /api/search?q=&category=&subcategory=&sort=&free=&onSale=&page=` →
    `{ results: SearchResult[], totalCount, page, pageSize, hasMore }`
  - `GET /api/categories` → `[{ slug, label, count, subs: [{ slug, label, count }] }]`

**`SearchResult` type:** `{ id, name, publisher, thumbnail, rating, ratingCount, category,
price: { isFree, finalPrice, originalPrice, onSale, discountPercent, currency } }`
(prices as numbers; UI formats). Mapped from the `result.raw.*` fields in §5.

## 8. Data flow & caching

- **Token:** in-memory per hub, auto-refreshed; never exposed to the frontend.
- **Categories:** built dynamically from the Coveo facet, cached ~24h (SQLite, reusing the
  cache pattern). Self-maintaining — no hardcoded category list.
- **Search results:** light SQLite cache keyed by a hash of the normalized params, short TTL
  (~10 min) — makes back-navigation/return instant and keeps request volume polite. Stale or
  miss → live Coveo call.
- **Resilience:** if Coveo's response shape changes and mapping fails, the endpoint returns a
  clear error (HTTP 502, "search mapper needs updating"), consistent with the detail parser.

## 9. Frontend pieces (Vue, small units)

`BrowseView` (route `/`, the home) composed of: `SearchBar` (with id/URL detection +
"Open asset" shortcut), `SortMenu`, `CategorySheet` (bottom sheet, dynamic categories),
`FilterToggles` (Free / On-Sale), `ResultList` + `ResultCard` (list row), infinite scroll via
`IntersectionObserver`. API client gains `search(params)` and `getCategories()`. The current
`OpenAsset` view is removed (its behavior moves into `SearchBar`); `/asset/:id` is unchanged.

## 10. Testing

- **Capture a real Coveo search response and a facet response as fixtures** (like the detail
  fixture). Unit-test the hit→`SearchResult` mapper and the category-tree builder against them.
- `coveo.ts` token cache/refresh logic unit-tested (mock fetch + a fake `exp`).
- `searchService` tested with Coveo mocked (param→body translation, filter `aq` building, sort mapping).
- Routes via supertest with the service injected (DI, as in the MVP).
- Playwright e2e (fixture-backed): load Browse → type "terrain" → results render → tap first →
  lands on `/asset/:id`. Also: toggle Free, open category sheet.

## 11. Build phases

1. **Coveo seam + search endpoint** — `coveo.ts` (token mint/cache/refresh) + `searchService`
   (search + mapping) + `GET /api/search` + fixtures/tests.
2. **Browse UI** — `BrowseView` + `SearchBar` (with fold-in open-by-id) + `ResultList`/`ResultCard`
   + infinite scroll; results → detail. Make Browse the home.
3. **Categories** — `getCategories()` + `GET /api/categories` + `CategorySheet` (dynamic).
4. **Sort + Free/On-Sale** — `SortMenu` + `FilterToggles` wired to the query.

## 12. Risks & limitations

- **Unofficial / ToS-gray** — same posture as the MVP: personal use, polite volume, caching.
  Coveo showed no rate limiting, but keep requests low and cached.
- **Mandatory `context.userGroups`** — without it Coveo returns 0 results; the body builder
  must always include it.
- **Endpoint/org stability** — the token-mint route and org id are compiled into Unity's
  bundles; stable across normal deploys but could change in a major rebuild. Mapper/token
  failures surface loudly (502) rather than silently.
- **Token expiry** — handled by in-memory cache + refresh-near-exp + 401 retry-once.
