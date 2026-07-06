import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import publicRouter from './public.js';
import adminRouter from './admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(publicRouter);
  app.use(adminRouter);

  // Built React admin SPA
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/|w\/|embed\.js).*/, (req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}
