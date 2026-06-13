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
