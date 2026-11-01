// Startup diagnostic: which shipped migrations has the database not applied yet?
// Pure function — no database needed.
import { describe, expect, it } from 'vitest';
import { findPendingMigrations } from '../src/db/pendingMigrations.js';

describe('findPendingMigrations', () => {
  const files = ['103_backfill_roll_in_transit.ts', '104_stock_requests.ts', '105_stock_requests_permissions.ts'];

  it('reports the migrations the database is missing (the /shipments/create hang)', () => {
    expect(findPendingMigrations(files, ['103_backfill_roll_in_transit.ts'])).toEqual([
      '104_stock_requests',
      '105_stock_requests_permissions',
    ]);
  });

  it('reports nothing when the database is up to date', () => {
    expect(findPendingMigrations(files, files)).toEqual([]);
  });

  it('matches compiled .js files against names recorded as .ts (production build)', () => {
    const built = ['104_stock_requests.js', '104_stock_requests.d.ts', '104_stock_requests.js.map'];
    expect(findPendingMigrations(built, ['104_stock_requests.ts'])).toEqual([]);
    expect(findPendingMigrations(built, [])).toEqual(['104_stock_requests']);
  });
});
