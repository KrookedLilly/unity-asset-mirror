import express, { type Express } from 'express';
import type { Db } from './cache.js';
import { getAsset as defaultGetAsset } from './assetService.js';
import { search as defaultSearch, getCategories as defaultGetCategories } from './searchService.js';
import type { Asset, SearchResponse, Category, SearchParams } from './types.js';

interface Deps {
  getAsset: (db: Db, id: string, opts?: { force?: boolean }) => Promise<Asset>;
  search: (p: SearchParams) => Promise<SearchResponse>;
  getCategories: (parent?: string) => Promise<Category[]>;
}

export function buildApp(
  db: Db,
  deps: Deps = { getAsset: defaultGetAsset, search: defaultSearch, getCategories: defaultGetCategories },
): Express {
  const app = express();
  app.use(express.json());

  const send = async (id: string, force: boolean, res: express.Response) => {
    try {
      res.json(await deps.getAsset(db, id, { force }));
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg.includes('parser needs updating') ? 502 : 500).json({ error: msg });
    }
  };

  app.get('/api/asset/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    void send(req.params.id, req.query.refresh === '1', res);
  });

  app.post('/api/asset/:id/refresh', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    void send(req.params.id, true, res);
  });

  app.get('/api/search', (req, res) => {
    const p: SearchParams = {
      q: typeof req.query.q === 'string' ? req.query.q : '',
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      subcategory: typeof req.query.subcategory === 'string' ? req.query.subcategory : undefined,
      sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
      free: req.query.free === '1',
      onSale: req.query.onSale === '1',
      page: Number(req.query.page ?? 0) || 0,
    };
    deps.search(p)
      .then((r) => res.json(r))
      .catch((e) => res.status(/coveo|mapper/i.test((e as Error).message) ? 502 : 500).json({ error: (e as Error).message }));
  });

  app.get('/api/categories', (req, res) => {
    const parent = typeof req.query.parent === 'string' ? req.query.parent : undefined;
    deps.getCategories(parent)
      .then((c) => res.json(c))
      .catch((e) => res.status(502).json({ error: (e as Error).message }));
  });

  return app;
}
