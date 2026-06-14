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
