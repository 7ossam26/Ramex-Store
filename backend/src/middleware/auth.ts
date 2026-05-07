import type { RequestHandler } from 'express';
import { verifyJwt, type JwtPayload, type Role } from '../lib/jwt.js';

declare module 'express-serve-static-core' {
  interface Request { user?: JwtPayload }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    req.user = verifyJwt(h.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};
