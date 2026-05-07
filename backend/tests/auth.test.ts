import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/connection.js';
import { hashPassword } from '../src/lib/password.js';
import * as auth from '../src/domain/auth/auth.service.js';

const dbAvailable = async () => {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(!process.env.RUN_DB_TESTS)('auth service (requires DB)', () => {
  beforeAll(async () => {
    if (!(await dbAvailable())) return;
    await db.migrate.latest();
    await db('users').where({ username: 'test_owner' }).del();
    await db('users').insert({
      username: 'test_owner',
      password_hash: await hashPassword('Test1234!'),
      full_name_ar: 'مالك تجريبي',
      role: 'owner',
    });
  });

  afterAll(async () => {
    if (!(await dbAvailable())) return;
    await db('users').where({ username: 'test_owner' }).del();
    await db.destroy();
  });

  it('login with correct creds returns token', async () => {
    const r = await auth.login('test_owner', 'Test1234!', 'vitest', '127.0.0.1');
    expect(r).not.toBeNull();
    expect(r?.token).toMatch(/^eyJ/);
  });

  it('login with wrong password returns null', async () => {
    const r = await auth.login('test_owner', 'wrong', 'vitest', '127.0.0.1');
    expect(r).toBeNull();
  });
});
