import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/routes.js';

const fakeAsset = { id: '341308', name: 'Text Animator' } as any;

function app(getAsset: any) {
  return buildApp({} as any, { getAsset });
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
