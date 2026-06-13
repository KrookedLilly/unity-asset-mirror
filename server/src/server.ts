import 'dotenv/config';
import { openDb } from './cache.js';
import { buildApp } from './routes.js';

const db = openDb(process.env.DB_PATH ?? './data.sqlite');
const app = buildApp(db);
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`asset-mirror server listening on :${port}`));
