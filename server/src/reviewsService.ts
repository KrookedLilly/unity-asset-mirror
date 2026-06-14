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
