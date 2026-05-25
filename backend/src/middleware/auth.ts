import type { RequestHandler } from 'express';
import { verifyJwt, type JwtPayload, type Role } from '../lib/jwt.js';

declare module 'express-serve-static-core' {
  interface Request { user?: JwtPayload }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const h = req.headers.authorization;
  let token: string | undefined;

  if (h?.startsWith('Bearer ')) {
    token = h.slice(7);
  } else if (typeof req.query['token'] === 'string' && req.query['token']) {
    // Fallback for export/print links opened in new tabs (can't set headers via <a>)
    token = req.query['token'] as string;
  }

  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    req.user = verifyJwt(token);
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
