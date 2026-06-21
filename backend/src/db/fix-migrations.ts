import knex from 'knex';
import { env } from '../config/env.js';

const db = knex({
  client: 'pg',
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },
});

const names = [
  '079_alter_fabrics_add_gsm_mad.ts',
  '080_make_composition_nullable.ts',
];

await db('knex_migrations').whereIn('name', names).delete();
console.log('Deleted stale migration records:', names);
await db.destroy();
