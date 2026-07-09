import express from 'express';
// Patches Express 4 so async route handlers / middleware that throw (or reject)
// forward the error to `errorHandler` instead of hanging the request forever.
// Must be imported before any router is constructed. See errorHandler + the
// former unhandledRejection escape hatch below.
import 'express-async-errors';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './api/routes.js';
import { startStaleInvoiceCron } from './domain/sales/staleInvoices.job.js';
import { startArchiveCron } from './domain/notifications/archiveJob.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(requestId);
app.use(pinoHttp({ logger, customProps: (req) => ({ reqId: (req as express.Request).id }) }));
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', apiRouter);

const publicDir = resolve(process.cwd(), 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));
}

app.use(errorHandler);

export { app };

// Only start listening when this file is run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  // `express-async-errors` (imported at the top) now forwards async handler
  // rejections to `errorHandler`, so requests no longer hang on a throw. These
  // remain as a last-resort backstop for rejections raised outside the request
  // lifecycle (cron jobs, event emitters), so the process logs and survives
  // instead of the Node 20+ default of crashing.
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ err: reason, promise }, 'unhandledRejection — request may have hung');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
  });

  app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'ramex-store server up'));
  startStaleInvoiceCron();
  startArchiveCron();
}
