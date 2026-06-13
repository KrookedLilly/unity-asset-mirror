import express, { type Express } from 'express';
import type { Db } from './cache.js';
import { getAsset as defaultGetAsset } from './assetService.js';
import type { Asset } from './types.js';

interface Deps {
  getAsset: (db: Db, id: string, opts?: { force?: boolean }) => Promise<Asset>;
}

export function buildApp(db: Db, deps: Deps = { getAsset: defaultGetAsset }): Express {
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

  return app;
}
