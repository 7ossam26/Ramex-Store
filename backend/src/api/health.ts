import { Router } from 'express';
import { db } from '../db/connection.js';

export const healthRouter = Router();
healthRouter.get('/', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ ok: true, db: 'up', version: process.env.npm_package_version ?? '0.1.0' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});
