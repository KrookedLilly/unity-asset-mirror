# Unity Asset Mirror

A personal, single-user web app that wraps the Unity Asset Store with a better, mobile-first UI — built because the official site is painful to browse on a phone. It fetches an asset's page, parses the data the page already hydrates with, caches it in SQLite, and renders it through a Vue PWA.

**What's built:** a mobile-first **Browse** home — keyword search, category browse, sort (relevance / popular / newest / rating / price), and Free/On-Sale filters over an infinite-scroll list — plus an **asset detail page** with a **PhotoSwipe swipe + pinch-zoom fullscreen gallery** (no more tapping tiny arrows and drilling into images one at a time). You can also paste an id/URL straight into the search box to jump to an asset. Account features (owned/wishlist) and a personal layer (tags/collections) are deferred to later phases.

Search results come from Unity's Coveo backend (reachable anonymously); asset detail is parsed from the product page. See the design specs and plans under `docs/superpowers/` (`…unity-asset-mirror-design`, `…detail-gallery-mvp`, `…search-and-browse-design`, `…search-and-browse`).

## Architecture

```
Vue 3 + Tailwind PWA  ──/api──►  Express + TS server  ──►  assetstore.unity.com
(swipe gallery, mobile)          fetch → parse → cache         (+ public CDN images)
                                        │
                                   SQLite (better-sqlite3, 24h TTL)
```

The server fetches `https://assetstore.unity.com/packages/p/<id>` (301→ canonical page), extracts the `ReactDOMrender({…})` hydration JSON, reads `data.ENTITY.Product[<id>]`, dereferences its Apollo-normalized refs, and maps it to a typed `Asset`. Detail pages are public — no login needed for this MVP.

## Requirements

- Node 20+ (uses global `fetch`)

## Run it (two processes)

**1. Backend** (port 8787):
```bash
cd server
npm install
cp .env.example .env   # defaults are fine
npm run dev
```

**2. Frontend** (port 5173; proxies `/api` → 8787):
```bash
cd web
npm install
npm run dev
```

Open <http://localhost:5173>, paste an Asset Store URL or an asset id (e.g. `341308`), and tap a screenshot to open the gallery.

## Tests

```bash
# backend: parser/cache/fetcher/service/routes
cd server && npm test          # vitest (19 tests)

# frontend: unit + end-to-end
cd web && npm test             # vitest (id parsing)
cd web && npm run e2e          # playwright: open → gallery → swipe → close
```

The e2e and offline dev use **fixture mode** — set `ASSET_FIXTURE=./tests/fixtures/detail-341308.html` in the server env to serve a saved page instead of hitting the network (deterministic, no live dependency).

## Notes

- Unofficial: this parses Unity's page structure, which can change without notice. The parser fails loudly (`/api/asset/:id` → HTTP 502 "parser needs updating") rather than serving junk, with parser tests pinned to a saved fixture.
- For personal, non-redistributed use only.
