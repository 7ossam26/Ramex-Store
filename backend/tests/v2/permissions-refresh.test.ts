/**
 * Regression test for the "permission restored → frontend still denies" path.
 *
 * Exercises the full revoke-then-restore cycle through the same endpoints the
 * frontend hits on refresh:
 *   1. super_admin sets a per-user override that revokes shipments.read
 *   2. factory user calls GET /users/me/permissions → shipments.read=false
 *   3. super_admin clears the override (is_allowed=null → revert to role default)
 *   4. factory user calls GET /users/me/permissions → shipments.read=true
 *
 * Step 4 is the critical assertion: the restored permission MUST be visible
 * immediately, with no stale cache lingering between the override-cleared
 * write and the next /users/me/permissions read.
 *
 * Requires a live database: RUN_DB_TESTS=1 npx vitest run tests/v2/permissions-refresh.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../src/db/connection.js';
import { hashPassword } from '../../src/lib/password.js';
import * as auth from '../../src/domain/auth/auth.service.js';
import { app } from '../../src/server.js';

describe.skipIf(!process.env.RUN_DB_TESTS)('Permissions refresh — revoke + restore cycle (requires DB)', () => {
  let factoryToken: string;
  let superAdminToken: string;
  let factoryUserId: number;

  beforeAll(async () => {
    await db.migrate.latest();

    await db('users').whereIn('username', ['pr_factory', 'pr_super']).del();

    const inserted = await db('users')
      .insert([
        {
          username: 'pr_factory',
          password_hash: await hashPassword('Test1234!'),
          full_name_ar: 'مرسل مصنع تجريبي',
          role: 'factory_sender',
        },
        {
          username: 'pr_super',
          password_hash: await hashPassword('Test1234!'),
          full_name_ar: 'مسؤول تجريبي',
          role: 'super_admin',
        },
      ])
      .returning(['id', 'username']);

    factoryUserId = inserted.find((u) => u.username === 'pr_factory')!.id;

    const factoryLogin = await auth.login('pr_factory', 'Test1234!', 'vitest-pr', '127.0.0.1');
    const superLogin = await auth.login('pr_super', 'Test1234!', 'vitest-pr', '127.0.0.1');
    factoryToken = factoryLogin!.token;
    superAdminToken = superLogin!.token;
  });

  afterAll(async () => {
    await db('user_permission_overrides').where({ user_id: factoryUserId }).del();
    await db('users').whereIn('username', ['pr_factory', 'pr_super']).del();
    await db.destroy();
  });

  it('baseline: factory_sender role default grants shipments.read', async () => {
    const res = await request(app)
      .get('/api/users/me/permissions')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(200);
    expect(res.body.all).toBe(false);
    expect(res.body.permissions.shipments.read).toBe(true);
    // Hard-deny invariant still enforced regardless of any DB row.
    expect(res.body.permissions.shipments.approve).toBe(false);
  });

  it('revoke via override → shipments.read becomes false', async () => {
    const revoke = await request(app)
      .patch(`/api/users/${factoryUserId}/permissions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send([{ resource: 'shipments', action: 'read', is_allowed: false }]);
    expect(revoke.status).toBe(200);

    const res = await request(app)
      .get('/api/users/me/permissions')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.shipments.read).toBe(false);
  });

  it('restore by clearing override → shipments.read is true again immediately (no stale cache)', async () => {
    const restore = await request(app)
      .patch(`/api/users/${factoryUserId}/permissions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send([{ resource: 'shipments', action: 'read', is_allowed: null }]);
    expect(restore.status).toBe(200);

    // No artificial delay — the override-cleared write must be visible on the
    // very next /users/me/permissions read. invalidateUserCache(userId) inside
    // bulkUpsertOverridesForUser is what makes this true.
    const res = await request(app)
      .get('/api/users/me/permissions')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.shipments.read).toBe(true);
    expect(res.body.permissions.shipments.approve).toBe(false);
  });

  it('restore by explicit true override → also takes effect immediately', async () => {
    // First revoke again, then restore via an explicit true (not via clearing).
    await request(app)
      .patch(`/api/users/${factoryUserId}/permissions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send([{ resource: 'shipments', action: 'read', is_allowed: false }]);

    const restoreTrue = await request(app)
      .patch(`/api/users/${factoryUserId}/permissions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send([{ resource: 'shipments', action: 'read', is_allowed: true }]);
    expect(restoreTrue.status).toBe(200);

    const res = await request(app)
      .get('/api/users/me/permissions')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.shipments.read).toBe(true);
  });
});
