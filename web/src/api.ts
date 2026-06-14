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

export interface SearchResultPrice { isFree: boolean; finalPrice: number | null; originalPrice: number | null; onSale: boolean; discountPercent: number | null; currency: string; }
export interface SearchResult { id: string; name: string; publisher: string | null; thumbnail: string | null; rating: number | null; ratingCount: number | null; category: string | null; subcategory: string | null; price: SearchResultPrice; }
export interface SearchResponse { results: SearchResult[]; totalCount: number; page: number; pageSize: number; hasMore: boolean; }
export interface Category { slug: string; label: string; count: number; }

export interface SearchQuery { q?: string; category?: string; subcategory?: string; sort?: string; free?: boolean; onSale?: boolean; page?: number; }

export async function search(query: SearchQuery): Promise<SearchResponse> {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.category) p.set('category', query.category);
  if (query.subcategory) p.set('subcategory', query.subcategory);
  if (query.sort) p.set('sort', query.sort);
  if (query.free) p.set('free', '1');
  if (query.onSale) p.set('onSale', '1');
  if (query.page) p.set('page', String(query.page));
  const res = await fetch(`/api/search?${p.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}

export async function getCategories(parent?: string): Promise<Category[]> {
  const res = await fetch(`/api/categories${parent ? `?parent=${encodeURIComponent(parent)}` : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
