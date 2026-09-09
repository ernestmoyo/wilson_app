import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

import { connect, migrate, seedDefaults } from './db.mjs';
import { buildApp } from './app.mjs';

const port = Number(process.env.PORT ?? 8000);
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const db = await connect();
const m = await migrate(db);
await seedDefaults(db);
console.log(`db: ${db.kind}${m.skipped ? ' (schema present)' : ' (migrated)'}`);

const app = buildApp(db, { allowedOrigin: process.env.ALLOWED_ORIGIN });

// Serve the Flutter web build from the same origin as the API — the layout
// Vercel uses (rewrites in vercel.json), reproduced locally so the live run
// exercises the same thing that deploys.
if (existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(publicDir, 'index.html')));
  console.log(`static: ${publicDir}`);
}

const server = app.listen(port, () => console.log(`assure-safety server on :${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => db.close().then(() => process.exit(0)));
  });
}
