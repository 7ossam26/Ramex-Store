import { spawn } from 'node:child_process';
import type { Response } from 'express';
import { env } from '../../config/env.js';

export function streamBackup(res: Response): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `ramex-backup-${date}.dump`;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const pgEnv = {
    ...process.env,
    PGPASSWORD: env.DB_PASSWORD,
  };

  const pg = spawn(
    'pg_dump',
    [
      '--format=custom',
      `--host=${env.DB_HOST}`,
      `--port=${env.DB_PORT}`,
      `--username=${env.DB_USER}`,
      env.DB_NAME,
    ],
    { env: pgEnv },
  );

  pg.stdout.pipe(res);

  pg.stderr.on('data', (chunk: Buffer) => {
    // Log stderr but don't fail silently — the response headers are already sent
    console.error('[pg_dump stderr]', chunk.toString());
  });

  pg.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'pg_dump not available' });
    } else {
      res.destroy(err);
    }
  });

  pg.on('close', (code) => {
    if (code !== 0 && !res.headersSent) {
      res.status(500).json({ error: `pg_dump exited with code ${code}` });
    }
  });
}
