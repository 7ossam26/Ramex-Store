/**
 * Phase 2 integration test — default-deny enforcement.
 *
 * Verifies that the requirePermission middleware correctly blocks access
 * when the user's role does not have the required permission in the matrix.
 *
 * Uses factory_sender which has many resources denied (customers, hr, suppliers,
 * reports.general) and owner which is denied settings.
 *
 * Requires a live database: RUN_DB_TESTS=1 npx vitest run tests/v2/default-deny.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../src/db/connection.js';
import { hashPassword } from '../../src/lib/password.js';
import * as auth from '../../src/domain/auth/auth.service.js';
import { app } from '../../src/server.js';

describe.skipIf(!process.env.RUN_DB_TESTS)('Phase 2 — default-deny enforcement (requires DB)', () => {
  let factoryToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    await db.migrate.latest();

    // Clean up any leftover test users
    await db('users').whereIn('username', ['dd_factory', 'dd_owner']).del();

    await db('users').insert([
      {
        username: 'dd_factory',
        password_hash: await hashPassword('Test1234!'),
        full_name_ar: 'مرسل مصنع تجريبي',
        role: 'factory_sender',
      },
      {
        username: 'dd_owner',
        password_hash: await hashPassword('Test1234!'),
        full_name_ar: 'مالك تجريبي',
        role: 'owner',
      },
    ]);

    const factoryLogin = await auth.login('dd_factory', 'Test1234!', 'vitest-dd', '127.0.0.1');
    const ownerLogin = await auth.login('dd_owner', 'Test1234!', 'vitest-dd', '127.0.0.1');
    factoryToken = factoryLogin!.token;
    ownerToken = ownerLogin!.token;
  });

  afterAll(async () => {
    await db('users').whereIn('username', ['dd_factory', 'dd_owner']).del();
    await db.destroy();
  });

  // ─── factory_sender denied resources ──────────────────────────────────────

  it('factory_sender → GET /api/customers is 403', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(403);
  });

  it('factory_sender → GET /api/hr/employees is 403', async () => {
    const res = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(403);
  });

  it('factory_sender → GET /api/suppliers is 403', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(403);
  });

  it('factory_sender → GET /api/reports/general is 403', async () => {
    const res = await request(app)
      .get('/api/reports/general')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(403);
  });

  it('factory_sender → GET /api/shifts/current is 403 (cash_drawer denied)', async () => {
    const res = await request(app)
      .get('/api/shifts/current')
      .set('Authorization', `Bearer ${factoryToken}`);
    expect(res.status).toBe(403);
  });

  // ─── owner denied settings ─────────────────────────────────────────────────

  it('owner → GET /api/settings is 403 (super_admin only)', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('owner → PATCH /api/settings/:key is 403 (super_admin only)', async () => {
    const res = await request(app)
      .patch('/api/settings/company_name_ar')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 'test' });
    expect(res.status).toBe(403);
  });

  // ─── Unauthenticated → 401 for all newly-gated routes ─────────────────────

  it('unauthenticated → GET /api/customers is 401', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  it('unauthenticated → GET /api/hr/employees is 401', async () => {
    const res = await request(app).get('/api/hr/employees');
    expect(res.status).toBe(401);
  });

  it('unauthenticated → GET /api/suppliers is 401', async () => {
    const res = await request(app).get('/api/suppliers');
    expect(res.status).toBe(401);
  });

  it('unauthenticated → GET /api/reports/general is 401', async () => {
    const res = await request(app).get('/api/reports/general');
    expect(res.status).toBe(401);
  });

  it('unauthenticated → GET /api/settings is 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});
