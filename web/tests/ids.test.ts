import { describe, it, expect } from 'vitest';
import { extractAssetId } from '../src/ids.js';

describe('extractAssetId', () => {
  it('accepts a bare numeric id', () => {
    expect(extractAssetId('341308')).toBe('341308');
  });
  it('extracts the trailing id from a full product url', () => {
    expect(extractAssetId('https://assetstore.unity.com/packages/tools/gui/text-animator-for-unity-...-341308'))
      .toBe('341308');
  });
  it('extracts from a /packages/p/<id> url', () => {
    expect(extractAssetId('https://assetstore.unity.com/packages/p/341308')).toBe('341308');
  });
  it('returns null for junk', () => {
    expect(extractAssetId('hello world')).toBeNull();
  });
});
