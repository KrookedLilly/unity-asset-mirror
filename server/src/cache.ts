import Database from 'better-sqlite3';
import type { Asset } from './types.js';

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );`);
  return db;
}

export function getCachedAsset(db: Db, id: string, maxAgeMs: number): Asset | null {
  const row = db.prepare('SELECT json, fetched_at AS fetchedAt FROM assets WHERE id = ?').get(id) as
    | { json: string; fetchedAt: number } | undefined;
  if (!row) return null;
  if (Date.now() - row.fetchedAt > maxAgeMs) return null;
  return JSON.parse(row.json) as Asset;
}

export function putAsset(db: Db, asset: Asset): void {
  db.prepare(
    `INSERT INTO assets (id, json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
  ).run(asset.id, JSON.stringify(asset), asset.fetchedAt);
}
