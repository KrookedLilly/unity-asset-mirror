/** Accept a bare id, a /packages/p/<id> url, or a canonical slug-<id> url. */
export function extractAssetId(input: string): string | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/(?:\/p\/|-)(\d{4,9})(?:[/?#]|$)/);
  return m ? m[1] : null;
}
