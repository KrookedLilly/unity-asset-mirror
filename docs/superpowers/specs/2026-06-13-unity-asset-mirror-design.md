# Unity Asset Mirror — Design Spec

**Date:** 2026-06-13
**Status:** Approved (design); ready for implementation planning
**Author:** krooked590 (with Claude)

## 1. Summary

A personal, single-user web app that wraps the Unity Asset Store with a far better
browsing experience — especially on mobile. It fetches data from
`assetstore.unity.com`, parses the structured data already embedded in each page,
caches it locally in SQLite, and renders it through a mobile-first Vue PWA with the
navigation, search, and **media gallery** the official site lacks.

The headline feature is a **swipe + pinch-zoom fullscreen gallery**: tap any
screenshot and swipe through all of an asset's media, instead of clicking tiny
arrows and drilling into images one at a time.

This is for personal use only. It is not published, not multi-user, and does not
redistribute Unity content.

## 2. Goals

- Browse, search, and navigate the Asset Store with a UI tuned to the user's taste.
- A genuinely good **mobile** media gallery: tap-to-fullscreen, swipe between all
  media, pinch-zoom, swipe-to-dismiss.
- See **owned** and **wishlisted** status as badges on every result, and a
  **hide-owned** toggle.
- A personal organization layer the real site doesn't offer: **tags** and
  **collections**.
- Run as a small service on the user's own server, accessed only by the user.

## 3. Non-Goals (explicit)

- **No downloading** of `.unitypackage` files. Acquisition still happens via Unity
  Hub / Package Manager / Editor as normal. (Possible future spike; out of scope here.)
- **No full-catalog crawl.** Data is cached on access, not mirrored wholesale.
- **No write actions to Unity.** Owned/wishlist are read-only mirrors of the user's
  Unity account. Adding to the Unity wishlist or purchasing is not in scope; local
  collections cover "save for later."
- **No multi-user / no publishing.** Single user, single Unity account.
- **Notes** and **saved searches** are deferred to a later iteration.

## 4. Key Decisions (locked)

| Decision | Choice |
| --- | --- |
| Scope | Functional mirror — all features, data cached on access |
| Downloads | None |
| Auth | Pasted Unity session cookie in `.env` |
| Frontend | Vue 3 + Tailwind, mobile-first, installable PWA |
| Backend | Express + TypeScript + better-sqlite3 |
| Storage | SQLite (single file) |
| Gallery | PhotoSwipe-based fullscreen swipe/pinch lightbox |
| Account scope | Owned + wishlist only |
| Personal layer (v1) | Tags + collections + hide-owned (notes & saved searches later) |
| App security | Simple shared-password gate over the whole app |

## 5. How the data acquisition works (verified)

Probed `assetstore.unity.com` on 2026-06-13:

- The site is **Next.js**; product and listing pages **server-render an embedded
  Apollo GraphQL cache** directly in the HTML (objects carry `__typename` markers
  such as `ProductImage`, `PackageRating`, `Price`).
- A product page contains the **full media gallery** as a structured `images` array.
  Example asset returned **98 screenshots**, each with `imageUrl` (full-res) and
  `thumbnailUrl`, plus rich fields: `price`, `rating`, `reviewCount`, `publisher`,
  `keyFeatures`, `compatibilityInfo`, `downloadSize`, `currentVersion`,
  `publishedDate`, `category`.
- Media is hosted on public CDNs (`assetstorev1-prd-cdn.unity3d.com`,
  `unity-assetstorev2-prd.storage.googleapis.com`) — directly embeddable, no auth.
- No Cloudflare challenge was hit with a normal browser User-Agent.
- Search/listing is Coveo/Solr-backed; listing pages embed the product list the
  same way.
- Legacy JSON endpoints (`/api/en-US/content/overview/{id}.json`) are dead (404/301).

**Therefore the acquisition strategy is uniform:** fetch the relevant Asset Store
URL (with the session cookie for account pages), parse the embedded JSON out of the
HTML, map it to typed domain objects. No GraphQL reverse-engineering, no API keys.

> **Not yet probed:** the exact **My Assets** and **wishlist** page URLs and their
> embedded shape (they require auth, which we deferred). Phase 4 includes a
> discovery sub-task: log in, capture those pages, and build their parser.
> A direct Coveo search API call is a possible optimization but is **not** the
> default; SSR-parse is the baseline to avoid API-token fragility.

## 6. Architecture

```
┌─ Vue 3 + Tailwind PWA ─────────────┐     ┌─ Server (Express + TS) ───────────┐
│ • Browse / search / category nav   │ ──► │ • /api/* routes (thin)            │ ──► assetstore.unity.com
│ • Asset page + SWIPE GALLERY       │     │ • Fetcher  (HTTP + cookie + throttle) │   (+ public CDN images)
│ • My Assets / wishlist / owned     │ ◄── │ • Parser   (HTML → typed objects) │ ◄──
│ • Tags / collections / hide-owned  │JSON │ • Cache    (read-through, TTL)    │
└────────────────────────────────────┘     └──────────────┬────────────────────┘
                                                           ▼
                                                    SQLite (better-sqlite3)
```

Four backend units, each one responsibility, each independently testable:

- **Fetcher** — performs HTTP GETs to the store with a realistic User-Agent,
  attaches the session cookie for account-scoped requests, throttles outbound
  requests (low concurrency + small delay) to stay polite.
- **Parser** — locates the embedded JSON in returned HTML and maps it to typed
  domain objects (Asset, Image, Publisher, ListingResult, AccountItem). Keeps the
  raw JSON. Validates shape; on mismatch it throws a clear "parser needs updating"
  error rather than returning junk.
- **Cache** — read-through SQLite layer with per-entity TTL; upserts parsed data;
  serves stale data as fallback when a live fetch fails.
- **Routes** — thin Express handlers wiring Cache → (Fetcher → Parser) and serving
  JSON to the PWA, plus CRUD for the local personal layer.

## 7. Data flow & caching

Read-through: request → check SQLite freshness → if stale/missing, fetch + parse +
upsert → return JSON.

| Data | TTL | Refresh |
| --- | --- | --- |
| Asset detail + images | ~24h | Manual "refresh" button per asset |
| Search / listing results | ~15 min | Cache fallback if store is slow/down |
| Categories | ~7 days | Manual |
| My Assets / wishlist | On-demand | "Sync now" button |

## 8. Data model (SQLite)

- `assets` — id, slug, name, publisher_id, category, price, sale_price, rating,
  review_count, key_image, raw_json, fetched_at
- `asset_images` — asset_id, idx, type, image_url, thumb_url
- `publishers` — id, name, …
- `categories` — id, parent_id, name, slug
- `owned` — asset_id, acquired_at (mirrored from Unity account)
- `wishlist` — asset_id, added_at (mirrored from Unity account)
- **Personal layer (local-only):**
  - `tags` — id, name, color
  - `asset_tags` — asset_id, tag_id
  - `collections` — id, name, description
  - `collection_items` — collection_id, asset_id, position

`raw_json` is retained alongside parsed columns so a future Unity page change cannot
lose data and so records can be re-parsed without re-fetching.

## 9. Backend endpoints

- `GET /api/search?q=&category=&sort=&page=` — listing results (cached)
- `GET /api/asset/:id` — full asset detail incl. media array (cached)
- `POST /api/asset/:id/refresh` — force re-fetch
- `GET /api/categories` — category tree
- `GET /api/my-assets` — owned library (auth)
- `GET /api/wishlist` — wishlist (auth)
- `POST /api/sync/account` — refresh owned + wishlist sets
- Personal layer CRUD: `/api/tags`, `/api/collections` (+ items), and tag/collection
  assignment endpoints

**Owned/wishlist overlay:** account sync stores the set of owned + wishlisted asset
IDs locally; listing/detail responses are annotated against those sets so the UI can
badge results and support hide-owned without per-result lookups to Unity.

## 10. Frontend

Mobile-first Vue 3 + Tailwind, installable PWA (service worker caches the **app
shell** only, not store data). Primary target is phone; works on desktop.

Pages: Home/browse · Search results (grid, filters, sort, badges, hide-owned) ·
Category nav · **Asset detail** · My Assets · Wishlist · Collections · Tag views.

### 10.1 The gallery (centerpiece)

```
 Asset page (mobile)                 Tap any image →  FULLSCREEN LIGHTBOX
 ┌─────────────────────┐            ┌───────────────────────────────┐
 │  ◀ ▢▢▢▢▢▢▢▢ ▶  strip │            │                          12/98 │
 │  ┌───────────────┐   │            │        ◀  [ full image ]  ▶    │
 │  │  main image   │   │   tap      │         swipe ← → between all  │
 │  │   (tap = ⤢)   │   │  ───────►  │         pinch to zoom          │
 │  └───────────────┘   │            │         swipe ↓ to close       │
 │  title · ★4.8 · $329 │            │   (videos play inline here)    │
 └─────────────────────┘            └───────────────────────────────┘
```

- Tap **any** thumbnail → fullscreen. Swipe left/right through **all** media.
  Pinch-zoom. Swipe-down to dismiss. Media counter.
- Built on **PhotoSwipe** (swipe + pinch-zoom + drag-to-close come for free; minimal
  custom gesture code).
- Images **lazy-load** (galleries can be ~100 items).
- **Videos** handled generically by the media `type` field as first-class items in
  the same lightbox (the probe asset had only screenshots; the parser/UI must not
  assume that).

## 11. Account features & auth

- The user logs into the Asset Store in a browser and pastes the relevant session
  cookie into the server `.env`.
- The Fetcher attaches that cookie **only** for account-scoped requests.
- Surfaces: **My Assets (owned)**, **wishlist**, owned/wishlist **badges** on browse
  results, and a **hide-owned** toggle.
- Sessions expire; when account fetches start failing auth, the app surfaces a clear
  "re-paste your cookie" state. (No silent failures.)

## 12. Security

The app holds the user's Unity session, so the **entire app sits behind a simple
shared-password gate** (app-level login, unrelated to Unity). Minimal: one secret,
a signed session cookie. Intended for the user's own LAN/server, not public exposure.

## 13. Cross-cutting concerns

- **Parser resilience** — parser is unit-tested against **saved sample pages**
  (detail, listing, my-assets). A Unity page-shape change fails tests loudly and
  makes the affected endpoint return a clear "parser needs updating" error.
- **Politeness / rate limiting** — single-user, low volume; outbound throttling +
  cache reliance so Unity is never hammered; realistic User-Agent.
- **Errors** — parse-shape failures surface loudly; network failures fall back to
  cached data where available.
- **Testing** — Vitest for unit (parser, cache, mappers); Playwright for key UI
  flows incl. the gallery.
- **Deploy** — Node service + SQLite file on the user's server; PWA served as a
  static build.

## 14. Risks & limitations

- **Unofficial / undocumented** — everything depends on Unity's page structure;
  it can change without notice and break the parser. Mitigated by raw_json
  retention + sample-page tests + loud failures.
- **ToS** — scraping technically violates Unity's ToS. Accepted for personal,
  non-published, non-redistributed use; it is the user's own account.
- **Session expiry** — pasted cookie needs periodic refresh (manual, trivial).
- **Account page shapes unverified** — My Assets/wishlist parsing is a Phase 4
  discovery task (see §5 note).

## 15. Build phases

1. **Core read path** — Fetcher + Parser + Cache + `GET /api/asset/:id` +
   `GET /api/search`. Parser tests against saved sample pages.
2. **The gallery** — mobile-first asset page + PhotoSwipe lightbox. (User's #1 pain,
   fixed early.)
3. **Browse/search UI** — categories, filters, sort, results grid.
4. **Account** — cookie auth, My Assets + wishlist discovery & parser, owned/wishlist
   overlay + hide-owned.
5. **Personal layer** — tags + collections.
6. *(Later, separate spike — out of scope here)* download-manager feasibility probe.

## 16. Future / deferred

- Notes, saved searches.
- Optional full-library bulk caching of owned assets.
- Direct Coveo search API integration (optimization).
- Download-manager feasibility spike (reverse-engineer the entitlement flow first).
