import type { RequestHandler } from 'express';
import { db } from '../db/connection.js';

export const requireActiveSession: RequestHandler = async (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const row = await db('sessions')
    .where({ jwt_jti: req.user.jti, user_id: req.user.sub })
    .whereNull('revoked_at')
    .first();
  if (!row) {
    res.status(401).json({ error: 'session revoked' });
    return;
  }
  await db('sessions').where({ id: row.id }).update({ last_seen_at: db.fn.now() });
  next();
};
