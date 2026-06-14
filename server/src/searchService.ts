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
  }).filter((r: SearchResult) => r.id !== '');
  const totalCount = num(json?.totalCount) ?? 0;
  return { results, totalCount, page, pageSize: PAGE_SIZE, hasMore: (page + 1) * PAGE_SIZE < totalCount };
}

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
