import type { Asset, AssetImage, AssetPrice } from './types.js';
import type { Review, ReviewReply, ReviewsResponse } from './types.js';

export class ParserError extends Error {
  constructor(message: string) { super(message); this.name = 'ParserError'; }
}

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
    discountPercent: Number(op.discount?.percentage) || null,
    currency: op.currency ?? 'USD',
  };

  const images: AssetImage[] = Array.isArray(product.images)
    ? product.images.map((im: any, idx: number): AssetImage => ({
        index: idx,
        type: im.type ?? 'screenshot',
        imageUrl: normalizeUrl(im.imageUrl) ?? '',
        thumbnailUrl: normalizeUrl(im.thumbnailUrl) ?? normalizeUrl(im.imageUrl) ?? '',
      })).filter((im: AssetImage) => im.imageUrl !== '')
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
      replies: Array.isArray(c.replies) ? c.replies.map(mapReply).filter((x: ReviewReply | null): x is ReviewReply => x !== null) : [],
    }));

  return { reviews, total: toNum(meta.total_entries), page, pageSize: 10, lastPage: toNum(meta.last_page), sort };
}
