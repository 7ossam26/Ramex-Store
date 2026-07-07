import knex from 'knex';
// @ts-expect-error — @types/pg not installed; we only need the runtime types.setTypeParser hook.
import pg from 'pg';
import config from './knexfile.js';
import { env } from '../config/env.js';

// PG returns BIGINT (oid 20) as string by default to preserve precision.
// All app ids fit comfortably in JS Number, and code paths like
// invoices.service.lockAndValidateRolls build Map<number, ...> keyed by
// row.id — string-vs-number mismatch there silently throws ROLL_NOT_FOUND.
const pgTypes = (pg as { types: { setTypeParser: (oid: number, fn: (v: string) => unknown) => void } })
  .types;
pgTypes.setTypeParser(20, (val: string) => Number.parseInt(val, 10));

// PG returns DATE (oid 1082) as a JS Date at local midnight, which JSON-serializes
// to a timezone-shifted ISO string (e.g. '2026-08-07' → '2026-08-06T21:00:00Z' for
// Africa/Cairo) — corrupting the calendar day. A pure `date` has no time component,
// so keep the raw 'YYYY-MM-DD' string. All app types already model date columns as
// string. TIMESTAMP/TIMESTAMPTZ (oid 1114/1184) are unaffected and stay as Dates.
pgTypes.setTypeParser(1082, (val: string) => val);

export const db = knex(config[env.NODE_ENV]);
