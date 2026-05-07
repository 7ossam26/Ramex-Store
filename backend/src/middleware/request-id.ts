import { v4 as uuid } from 'uuid';
import type { RequestHandler } from 'express';

declare module 'express-serve-static-core' {
  interface Request { id: string }
}

export const requestId: RequestHandler = (req, res, next) => {
  req.id = (req.headers['x-request-id'] as string) || uuid();
  res.setHeader('x-request-id', req.id);
  next();
};
