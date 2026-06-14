# Asset Reviews — Design Spec

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation planning
**Phase:** 3a of the Unity Asset Mirror roadmap
**Builds on:** the Detail + Gallery MVP and Search & Browse phases

## 1. Summary

Add product **reviews** to the asset detail page and expose them as clean JSON at
`/api/asset/:id/reviews`. Reviews are a high-value signal for purchase/market-research
decisions and are hard to scrape from the real (client-rendered) Asset Store — but Unity
server-renders them anonymously, so we can parse them with the same technique we already
use for the detail page. The JSON endpoint also directly serves the user's marketing agent.

## 2. Goals

- Show an asset's reviews on its page: aggregate rating, a sortable list (most-helpful /
  recent / rating), with each review's stars, title, author, date, body, helpful count,
  reviewed version, and any **publisher replies**.
- Expose reviews as structured JSON (`/api/asset/:id/reviews`) an agent can page through.
- Reuse the existing hydration-parse + endpoint patterns; no new auth.

## 3. Non-Goals (anonymous limits, confirmed by spike)

- **No per-star distribution** (count per 1–5★) — Unity only SSRs the aggregate; the
  breakdown needs an authenticated GraphQL call. Deferred (could add later via the user's
  cookie).
- **No server-side rating filter** — the `rating` query param is ignored by the SSR; same
  authenticated-GraphQL limitation. Deferred.
- No writing/voting on reviews (read-only mirror).

## 4. Locked Decisions

| Decision | Choice |
| --- | --- |
| Source | SSR-parse `/packages/p/:id/reviews` (anonymous, no cookie) |
| Default sort | **Most helpful** |
| Sort options | helpful · recent · rating |
| Pagination | **Load more**, 10/page (Unity-fixed page size) |
| Publisher replies | **Shown inline** under each review |
| Caching | Fetch on demand (reviews change; no persistent cache) |
| Agent surface | `GET /api/asset/:id/reviews` returns clean JSON |

## 5. Verified recipe (spike, 2026-06-14)

Proven live on asset 341308 (170 reviews, 17 pages). **Anonymous — no cookie/CSRF/token.**

```
GET https://assetstore.unity.com/packages/p/{id}/reviews?page={1..lastPage}&sort_by={recent|helpful|rating}
  - follow the 301 to the canonical slug URL (-L); send a normal browser User-Agent
  - response is the same React app; reviews live in the embedded Apollo cache
```

**Where the data is** (in the `ReactDOMrender({...})` hydration JSON, `data.ENTITY`):
- `Product[<id>]` has a `reviews({…})` key → `{ count, total_entries, last_page, comments: [ {type:"id", id:["Comment","<cid>"]} … ] }`
- `Comment[<cid>]` → `{ id, date, rating, user:<ref ConnectUserProfile>, is_helpful:{count,score}, subject, version, full, replies:[…], … }`
- `ConnectUserProfile[<uid>]` → `{ id, name, … }`
- Aggregate (already parsed for the detail page): `Product[<id>].rating = {average, count}`, `reviewCount`.

`sort_by=helpful` vs `recent` return genuinely different sets (confirmed). `rating` filter
param is ignored by SSR (see Non-Goals).

## 6. Backend (extends existing units)

- **`reviewParser`** (in `parser.ts` or a focused module) — given the reviews-page HTML and
  the asset id, extract the hydration JSON (reuse `extractHydrationJson`; the reviews page is
  the same controller), read `Product[id].reviews(…)` metadata + deref each `Comment` and its
  `ConnectUserProfile`, and map to typed `Review`s. Throws a clear `ParserError` ("review
  parser needs updating") on shape mismatch.
- **`reviewsService.ts`** — `getReviews(id, { sort, page })`: build the URL, fetch (with the
  fetcher; supports the existing `ASSET_FIXTURE`-style fixture mode for tests), parse, return
  `ReviewsResponse`.
- **Endpoint** (`routes.ts`): `GET /api/asset/:id/reviews?sort=&page=` → `ReviewsResponse`.
  Numeric-id guard → 400; parser failure → 502 (consistent with the detail route). DI for tests.

**Types:**
```
Review        = { id, rating, title, body, author, date, version,
                  helpfulCount, helpfulScore, replies: ReviewReply[] }
ReviewReply   = { author, date, body }
ReviewsResponse = { reviews: Review[], total, page, pageSize, lastPage, sort }
```
Sort mapping (UI → URL `sort_by`): `helpful→helpful`, `recent→recent`, `rating→rating`;
default `helpful`. `helpfulCount`/`helpfulScore` parsed from the string `is_helpful` fields.

## 7. Frontend

A new **`Reviews.vue`** component rendered on the asset detail page (below Key Features):
- **Header:** aggregate — ★ `rating` average + "(`reviewCount`) reviews" (already on the Asset).
- **Sort toggle:** Most helpful (default) · Recent · Rating — changing it refetches page 1.
- **List:** each review shows star rating, title, author, date, "👍 N helpful", reviewed
  `version`, the body text, and any **publisher replies** indented beneath it.
- **Load more:** fetches the next page (10 at a time) up to `lastPage`; shows remaining count.
- Loading/error/empty states consistent with the rest of the app. Lazy: reviews are fetched
  when the component mounts on the detail page (one extra request per asset view).

## 8. Agent angle

`GET /api/asset/:id/reviews?sort=helpful&page=N` returns clean JSON — an agent can page
`helpful` for the strongest signal or `recent` for freshness, and read `replies` to gauge
publisher responsiveness. This is the first concrete piece of the broader agent-access layer
(to be designed once the user brings their agent's field requirements).

## 9. Testing

- Capture a real `/packages/p/341308/reviews` page as a fixture; unit-test the review parser
  against it (maps rating/title/body/author/date/version/helpful/replies; reads total &
  lastPage; derefs users). A page with a publisher reply should be represented (or a synthetic
  one) to cover `replies`.
- `reviewsService` tested in fixture mode (URL build + sort mapping + pagination passthrough).
- Route tested via supertest with the service injected (DI).
- Frontend: Playwright — open an asset, the Reviews section renders, switching sort refetches,
  Load more appends (fixture-backed backend).

## 10. Build phases

1. **Backend reviews** — review parser + `reviewsService` + `GET /api/asset/:id/reviews` +
   fixtures/tests.
2. **Reviews UI** — `Reviews.vue` on the asset page (aggregate, sort toggle, list with replies,
   load-more) + e2e.

## 11. Risks & limitations

- **Unofficial / ToS-gray** — same posture as the rest of the app: personal use, polite volume.
- **Anonymous ceiling** — no star distribution, no rating filter (documented Non-Goals);
  revisit with the user's session cookie if ever wanted.
- **SSR shape changes** — review parser fails loudly (502) rather than serving junk; pinned to
  a saved fixture.
