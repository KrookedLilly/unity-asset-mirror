import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractHydrationJson, ParserError } from '../src/parser.js';

const html = readFileSync(new URL('./fixtures/detail-341308.html', import.meta.url), 'utf-8');

describe('extractHydrationJson', () => {
  it('returns the parsed ReactDOMrender argument', () => {
    const data = extractHydrationJson(html);
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveProperty('ENTITY');
    expect(data.data.ENTITY.Product['341308'].name).toContain('Text Animator');
  });

  it('throws ParserError when the anchor is missing', () => {
    expect(() => extractHydrationJson('<html>no controller here</html>')).toThrow(ParserError);
  });
});
