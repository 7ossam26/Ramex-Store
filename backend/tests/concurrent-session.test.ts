import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/connection.js';
import { hashPassword } from '../src/lib/password.js';
import * as auth from '../src/domain/auth/auth.service.js';

describe.skipIf(!process.env.RUN_DB_TESTS)('concurrent-session blocking', () => {
  beforeAll(async () => {
    await db.migrate.latest();
    await db('users').where({ username: 'cc_test' }).del();
    await db('users').insert({
      username: 'cc_test',
      password_hash: await hashPassword('Pass1234!'),
      full_name_ar: 'مستخدم اختبار',
      role: 'shop_seller',
    });
  });

  afterAll(async () => {
    await db('users').where({ username: 'cc_test' }).del();
    await db.destroy();
  });

  it('second login revokes the first session', async () => {
    const first = await auth.login('cc_test', 'Pass1234!', 'device-A', '1.1.1.1');
    const second = await auth.login('cc_test', 'Pass1234!', 'device-B', '2.2.2.2');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const userRow = await db('users').where({ username: 'cc_test' }).first();
    const userId = userRow!.id;
    const active = await db('sessions').where({ user_id: userId }).whereNull('revoked_at');
    expect(active).toHaveLength(1);

    const sessionA = await db('sessions').where({ user_id: userId, device_info: 'device-A' }).first();
    expect(sessionA?.revoked_at).not.toBeNull();
  });
});
