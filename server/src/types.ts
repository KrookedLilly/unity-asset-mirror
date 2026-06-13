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
