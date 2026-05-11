import type { Knex } from 'knex';
import { env } from '../config/env.js';

const config: { [k: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: { directory: './seeds', loadExtensions: ['.ts'] },
    pool: { min: 2, max: 10 },
  },
};

config.production = config.development;
config.test = config.development;

export default config;
