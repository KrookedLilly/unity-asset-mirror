import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/routes.js';
import { search as realSearch, getCategories as realCats } from '../src/searchService.js';
import { getReviews as realGetReviews } from '../src/reviewsService.js';

const fakeAsset = { id: '341308', name: 'Text Animator' } as any;

function app(getAsset: any) {
  return buildApp({} as any, { getAsset, search: realSearch, getCategories: realCats, getReviews: realGetReviews });
}

describe('routes', () => {
  it('GET /api/asset/:id returns the asset as JSON', async () => {
    const res = await request(app(async () => fakeAsset)).get('/api/asset/341308');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Text Animator');
  });

  it('rejects a non-numeric id with 400', async () => {
    const res = await request(app(async () => fakeAsset)).get('/api/asset/abc');
    expect(res.status).toBe(400);
  });

  it('maps parser errors to 502', async () => {
    const res = await request(app(async () => { throw new Error('parser needs updating'); }))
      .get('/api/asset/341308');
    expect(res.status).toBe(502);
  });

  it('returns 500 on an unexpected error', async () => {
    const res = await request(app(async () => { throw new Error('db exploded'); }))
      .get('/api/asset/1');
    expect(res.status).toBe(500);
  });

  it('POST /api/asset/:id/refresh forces a refetch', async () => {
    let forced = false;
    const res = await request(app(async (_db: any, _id: string, opts: any) => { forced = opts?.force; return fakeAsset; }))
      .post('/api/asset/341308/refresh');
    expect(res.status).toBe(200);
    expect(forced).toBe(true);
  });
});

describe('search routes', () => {
  const okSearch = { results: [{ id: '1', name: 'X' }], totalCount: 1, page: 0, pageSize: 24, hasMore: false } as any;

  function searchApp(over: Partial<{ search: any; getCategories: any }>) {
    // Base defaults throw so a test that forgets to override can't silently hit live Coveo.
    return buildApp({} as any, {
      getAsset: async () => ({} as any),
      search: async () => { throw new Error('unexpected real Coveo call'); },
      getCategories: async () => { throw new Error('unexpected real Coveo call'); },
      getReviews: realGetReviews,
      ...over,
    });
  }

  it('GET /api/search forwards params and returns the response', async () => {
    let seen: any;
    const res = await request(searchApp({ search: async (p: any) => { seen = p; return okSearch; } }))
      .get('/api/search?q=terrain&category=tools&free=1&page=2&sort=rating');
    expect(res.status).toBe(200);
    expect(res.body.results[0].name).toBe('X');
    expect(seen).toMatchObject({ q: 'terrain', category: 'tools', free: true, page: 2, sort: 'rating' });
  });

  it('GET /api/categories returns the tree (and forwards parent)', async () => {
    let parent: any = 'unset';
    const res = await request(searchApp({ getCategories: async (p: any) => { parent = p; return [{ slug: 'tools', label: 'Tools', count: 5 }]; } }))
      .get('/api/categories?parent=tools');
    expect(res.status).toBe(200);
    expect(res.body[0].slug).toBe('tools');
    expect(parent).toBe('tools');
  });

  it('maps a coveo failure to 502', async () => {
    const res = await request(searchApp({ search: async () => { throw new Error('coveo search failed: HTTP 500'); } }))
      .get('/api/search?q=x');
    expect(res.status).toBe(502);
  });
});

describe('reviews route', () => {
  const okReviews = { reviews: [{ id: '1', title: 'X' }], total: 5, page: 1, pageSize: 10, lastPage: 1, sort: 'helpful' } as any;
  function revApp(getReviews: any) {
    return buildApp({} as any, { getAsset: async () => ({} as any), search: realSearch, getCategories: realCats, getReviews });
  }
  it('GET /api/asset/:id/reviews forwards sort+page and returns JSON', async () => {
    let seen: any;
    const res = await request(revApp(async (id: string, p: any) => { seen = { id, ...p }; return okReviews; }))
      .get('/api/asset/341308/reviews?sort=recent&page=2');
    expect(res.status).toBe(200);
    expect(res.body.reviews[0].title).toBe('X');
    expect(seen).toMatchObject({ id: '341308', sort: 'recent', page: 2 });
  });
  it('rejects a non-numeric id with 400', async () => {
    const res = await request(revApp(async () => okReviews)).get('/api/asset/abc/reviews');
    expect(res.status).toBe(400);
  });
  it('maps a parser failure to 502', async () => {
    const res = await request(revApp(async () => { throw new Error('review parser needs updating'); }))
      .get('/api/asset/341308/reviews');
    expect(res.status).toBe(502);
  });
});
