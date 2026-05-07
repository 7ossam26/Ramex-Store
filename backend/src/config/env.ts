import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Walk up from CWD to find .env (handles knex changing CWD to backend/src/db)
let dir = process.cwd();
while (true) {
  const candidate = resolve(dir, '.env');
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
  const parent = resolve(dir, '..');
  if (parent === dir) break; // reached filesystem root
  dir = parent;
}

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('12h'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const env = Schema.parse(process.env);
