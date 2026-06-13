import type { Db } from './cache.js';
import { getCachedAsset, putAsset } from './cache.js';
import { fetchAssetHtml } from './fetcher.js';
import { parseAssetDetail } from './parser.js';
import type { Asset } from './types.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export async function getAsset(db: Db, id: string, opts: { force?: boolean } = {}): Promise<Asset> {
  if (!opts.force) {
    const cached = getCachedAsset(db, id, TTL_MS);
    if (cached) return cached;
  }
  const html = await fetchAssetHtml(id);
  const asset = parseAssetDetail(html, id);
  putAsset(db, asset);
  return asset;
}
