import type { Knex } from 'knex';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

// Absolute path so db.migrate.latest() works in both dev (tsx, .ts files)
// and production (node, compiled .js files in dist/).
const __dirname = dirname(fileURLToPath(import.meta.url));

const config: { [k: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
    migrations: {
      directory: join(__dirname, 'migrations'),
      extension: 'ts',
      loadExtensions: ['.ts', '.js'],
    },
    seeds: { directory: join(__dirname, 'seeds'), loadExtensions: ['.ts', '.js'] },
    pool: { min: 2, max: 10 },
  },
};

config.production = config.development;
config.test = config.development;

export default config;
