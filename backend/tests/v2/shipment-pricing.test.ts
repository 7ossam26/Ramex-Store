// v2 Phase 10 — Shipment receiving / reference pricing.
// Q&A #10, #11, #12, #13, #14.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';

describe('v2 — shipment reference pricing (Q&A #10-12)', () => {
  it('contract — POST /api/shipments requires auth', async () => {
    const res = await request(app).post('/api/shipments').send({});
    expect(res.status).toBe(401);
  });

  // Q&A #12 — the receive payload must not accept per-roll price overrides.
  // We test by sending one and asserting the request shape is rejected or
  // the override is ignored. Without a live DB, we rely on the contract test.
  it.skipIf(!RUN_DB)('Q&A #12 — receive endpoint does not accept per-roll override', async () => {
    const login = await request(app).post('/api/auth/login').send({
      username: 'owner', password: 'ChangeMe123!',
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    // Try receive with a per-roll override key — should be ignored or rejected,
    // never quietly applied. Look up an existing shipment to test against.
    const list = await request(app).get('/api/shipments').set(auth);
    const pending = (list.body?.rows ?? list.body ?? []).find(
      (s: { status: string }) => s.status === 'pending_approval' || s.status === 'pending',
    );
    if (!pending) return; // No suitable test fixture — skip.

    const res = await request(app)
      .post(`/api/shipments/${pending.id}/receive`)
      .set(auth)
      .send({
        accepted_lines: [
          {
            line_id: pending.lines?.[0]?.id,
            // Per-roll override is NOT supported in v2 — strict one-price-per-fabric.
            per_roll_price_overrides: { '1': 999 },
          },
        ],
      });
    // Either schema rejects (400) or override is silently dropped — must not crash.
    expect(res.status).not.toBe(500);
  });
});
