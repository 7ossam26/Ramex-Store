import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const stripExt = (name: string): string => name.replace(/\.(ts|js|cjs|mjs)$/, '');

/** Migration files shipped with this code that the database has not applied yet. Pure. */
export function findPendingMigrations(files: string[], appliedNames: string[]): string[] {
  const applied = new Set(appliedNames.map(stripExt));
  return files
    .filter((f) => /\.(ts|js|cjs|mjs)$/.test(f) && !f.endsWith('.d.ts') && !f.endsWith('.map'))
    .map(stripExt)
    .filter((f) => !applied.has(f))
    .sort();
}

/**
 * Startup diagnostic, READ-ONLY and non-fatal: if the code expects migrations the
 * database does not have (e.g. a `tsx watch` dev server hot-reloaded new code against
 * an un-migrated DB), say so loudly instead of letting it surface later as HTTP 500s
 * such as `relation "stock_requests" does not exist`. It never runs a migration.
 */
export async function warnIfMigrationsPending(): Promise<void> {
  try {
    const dir = fileURLToPath(new URL('./migrations', import.meta.url));
    const rows: Array<{ name: string }> = await db('knex_migrations').select('name');
    const pending = findPendingMigrations(readdirSync(dir), rows.map((r) => r.name));
    if (pending.length > 0) {
      logger.error(
        { database: env.DB_NAME, pending },
        `DATABASE SCHEMA IS BEHIND THE CODE: ${pending.length} migration(s) not applied to "${env.DB_NAME}". ` +
          'Endpoints that use the new tables will fail until `npm run db:migrate` is run on this database.',
      );
    } else {
      logger.info({ database: env.DB_NAME }, 'database schema is up to date with the code');
    }
  } catch (err) {
    logger.warn({ err }, 'could not check for pending migrations');
  }
}
