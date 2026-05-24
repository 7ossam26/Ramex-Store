import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation', issues: err.issues });
    return;
  }
  logger.error({ err, reqId: req.id }, 'unhandled error');

  const body: { error: string; message?: string; detail?: string } = { error: 'internal' };
  if (err instanceof Error) {
    body.message = err.message;
    if (env.NODE_ENV !== 'production') {
      body.detail = err.stack;
    }
  }
  res.status(500).json(body);
};
