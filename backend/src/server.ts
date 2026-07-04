import express from 'express';
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
  // Express 4 doesn't auto-forward async route handler rejections to next().
  // Some controllers omit `next` and rely on the unhandledRejection escape hatch,
  // which on Node 20+ kills the process by default. Log and survive.
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
