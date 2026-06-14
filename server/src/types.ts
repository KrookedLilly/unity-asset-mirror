export interface SearchResultPrice {
  isFree: boolean;
  finalPrice: number | null;
  originalPrice: number | null;
  onSale: boolean;
  discountPercent: number | null; // whole percent, e.g. 50
  currency: string;
}

export interface SearchResult {
  id: string;
  name: string;
  publisher: string | null;
  thumbnail: string | null;
  rating: number | null;
  ratingCount: number | null;
  category: string | null;     // ec_category_level1, e.g. "tools"
  subcategory: string | null;  // ec_category_level2, e.g. "tools > terrain"
  price: SearchResultPrice;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Category {
  slug: string;   // facet value, e.g. "tools" or "tools > terrain"
  label: string;  // display label, e.g. "Tools" / "Terrain"
  count: number;
}

export interface SearchParams {
  q?: string;
  category?: string;
  subcategory?: string;
  sort?: string;   // relevance | price-asc | price-desc | rating | newest | popular
  free?: boolean;
  onSale?: boolean;
  page?: number;
}

export interface AssetImage {
  index: number;
  type: string;          // "screenshot" | "youtube" | ...
  imageUrl: string;      // full-res, absolute https
  thumbnailUrl: string;  // thumb, absolute https
}

export interface AssetPrice {
  isFree: boolean;
  finalPrice: string | null;     // e.g. "32.50"
  originalPrice: string | null;  // e.g. "65.00"
  onSale: boolean;
  discountPercent: number | null;
  currency: string;              // default "USD"
}

export interface Asset {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;    // HTML
  keyFeatures: string | null;    // HTML
  keyImage: string | null;       // hero image, absolute https
  rating: number | null;         // average stars
  ratingCount: number | null;
  reviewCount: number | null;
  publisher: string | null;
  publisherUrl: string | null;
  category: string | null;       // e.g. "Tools/GUI"
  price: AssetPrice;
  downloadSize: string | null;   // human-readable, e.g. "971 KB"
  firstPublishedDate: string | null;
  supportedUnityVersions: string[];
  tags: string[];
  images: AssetImage[];
  fetchedAt: number;             // epoch ms
}
