import { readFile } from 'node:fs/promises';

const BASE = 'https://assetstore.unity.com/packages/p/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchAssetHtml(id: string): Promise<string> {
  if (process.env.ASSET_FIXTURE) {
    return readFile(process.env.ASSET_FIXTURE, 'utf-8');
  }
  const res = await fetch(BASE + encodeURIComponent(id), {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch failed for asset ${id}: HTTP ${res.status}`);
  return res.text();
}

const REVIEWS_BASE = 'https://assetstore.unity.com/packages/p/';

export async function fetchReviewsHtml(id: string, sortBy: string, page: number): Promise<string> {
  if (process.env.REVIEWS_FIXTURE) {
    return readFile(process.env.REVIEWS_FIXTURE, 'utf-8');
  }
  const url = `${REVIEWS_BASE}${encodeURIComponent(id)}/reviews?page=${encodeURIComponent(String(page))}&sort_by=${encodeURIComponent(sortBy)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch failed for reviews ${id}: HTTP ${res.status}`);
  return res.text();
}
