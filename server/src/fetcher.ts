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
