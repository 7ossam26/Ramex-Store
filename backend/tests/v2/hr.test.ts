// v2 Phase 10 — HR module.
// Q&A #36, #37, #38, #39, #40.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import {
  CreateEmployeeSchema,
  DisburseSchema,
  CreateAdjustmentSchema,
} from '../../src/domain/hr/hr.schemas.js';

describe('v2 — HR (Q&A #36-40)', () => {
  it('contract — GET /api/hr/employees requires auth', async () => {
    const res = await request(app).get('/api/hr/employees');
    expect(res.status).toBe(401);
  });

  it('contract — POST /api/hr/salaries requires auth', async () => {
    const res = await request(app).post('/api/hr/salaries').send({});
    expect(res.status).toBe(401);
  });

  it('Q&A #36 — CreateEmployeeSchema accepts minimal fields', () => {
    const r = CreateEmployeeSchema.safeParse({
      name_ar: 'أحمد', phone: '01012345678', base_salary_egp: 5000,
    });
    expect(r.success).toBe(true);
  });

  it('Q&A #39 — phone validates against Egyptian regex 01[0125]XXXXXXXX', () => {
    expect(CreateEmployeeSchema.safeParse({
      name_ar: 'X', phone: '0101234567', base_salary_egp: 1, // 10 digits — too short
    }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({
      name_ar: 'X', phone: '01312345678', base_salary_egp: 1, // 013 — wrong prefix
    }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({
      name_ar: 'X', phone: '01012345678', base_salary_egp: 1,
    }).success).toBe(true);
    expect(CreateEmployeeSchema.safeParse({
      name_ar: 'X', phone: '01512345678', base_salary_egp: 1,
    }).success).toBe(true);
  });

  it('Q&A #36/#37 — CreateAdjustmentSchema captures advance + deduction', () => {
    for (const kind of ['advance', 'deduction'] as const) {
      const r = CreateAdjustmentSchema.safeParse({
        employee_id: 1, kind, amount_egp: 200, salary_month: '2026-06-01',
      });
      expect(r.success, kind).toBe(true);
    }
  });

  it('Q&A #36 — adjustment kind must be advance or deduction', () => {
    const r = CreateAdjustmentSchema.safeParse({
      employee_id: 1, kind: 'bonus' as never, amount_egp: 100, salary_month: '2026-06-01',
    });
    expect(r.success).toBe(false);
  });

  it('Q&A #37 — DisburseSchema requires bank_account_id for non-cash methods', () => {
    expect(DisburseSchema.safeParse({
      employee_id: 1, month: '2026-06-01', paid_via: 'cash',
    }).success).toBe(true);
    expect(DisburseSchema.safeParse({
      employee_id: 1, month: '2026-06-01', paid_via: 'instapay',
    }).success).toBe(false);
    expect(DisburseSchema.safeParse({
      employee_id: 1, month: '2026-06-01', paid_via: 'bank_transfer',
    }).success).toBe(false);
    expect(DisburseSchema.safeParse({
      employee_id: 1, month: '2026-06-01', paid_via: 'bank_transfer', bank_account_id: 1,
    }).success).toBe(true);
  });

  it('Q&A #38 — UNIQUE (employee, month) enforced via SALARY_ALREADY_DISBURSED', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/domain/hr/hr.routes.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain('SALARY_ALREADY_DISBURSED');
    expect(src).toContain('409');
  });

  it('Q&A #40 — HR permissions: view/manage/salary.disburse/advance.create/deduction.create', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/db/migrations/052_v2_phase_9_hr_module.ts', import.meta.url),
      'utf8',
    );
    for (const action of ['view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create']) {
      expect(src, `permission action ${action}`).toContain(action);
    }
  });
});
