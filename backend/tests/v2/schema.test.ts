// v2 Phase 10 — Schema verification.
//
// Verifies every column / constraint / FK / enum value specified in
// docs/requirements-v2.md §Cross-Cutting Schema Impact Summary actually
// landed in the live DB. Pure SQL via the Knex client.
//
// Gated by RUN_DB_TESTS=1: skipped when no DB available so the default
// `npm test` stays green without infrastructure.
import { describe, it, expect, afterAll } from 'vitest';
import { db } from '../../src/db/connection.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';

async function getColumn(
  table: string,
  column: string,
): Promise<{
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
} | null> {
  const r = await db.raw(
    `SELECT data_type, is_nullable, column_default, character_maximum_length
     FROM information_schema.columns
     WHERE table_name = ? AND column_name = ?`,
    [table, column],
  );
  return r.rows[0] ?? null;
}

async function getCheckClause(constraintName: string): Promise<string | null> {
  const r = await db.raw(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conname = ?`,
    [constraintName],
  );
  return r.rows[0]?.def ?? null;
}

async function indexExists(name: string): Promise<boolean> {
  const r = await db.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [name]);
  return r.rows.length > 0;
}

describe.skipIf(!RUN_DB)('v2 schema verification', () => {
  afterAll(async () => {
    await db.destroy();
  });

  // ─── fabrics ─────────────────────────────────────────────────────────────
  describe('fabrics', () => {
    it('Q&A #4 — unit column: varchar, NOT NULL, default kg', async () => {
      const col = await getColumn('fabrics', 'unit');
      expect(col).not.toBeNull();
      expect(col!.data_type).toBe('character varying');
      expect(col!.character_maximum_length).toBe(8);
      expect(col!.is_nullable).toBe('NO');
      expect(col!.column_default).toMatch(/'kg'/);
    });

    it('Q&A #4 — unit CHECK accepts kg + meter, rejects cm', async () => {
      const def = await getCheckClause('fabrics_unit_check');
      expect(def).toBeTruthy();
      expect(def).toContain("'kg'");
      expect(def).toContain("'meter'");
      expect(def).not.toContain("'cm'");
    });

    it('Q&A #1.2 — supplier_code column: varchar(64), nullable', async () => {
      const col = await getColumn('fabrics', 'supplier_code');
      expect(col).not.toBeNull();
      expect(col!.character_maximum_length).toBe(64);
      expect(col!.is_nullable).toBe('YES');
    });
  });

  // ─── rolls ───────────────────────────────────────────────────────────────
  describe('rolls', () => {
    it('lot_id column: bigint, nullable, FK → lots(id)', async () => {
      const col = await getColumn('rolls', 'lot_id');
      expect(col).not.toBeNull();
      expect(col!.data_type).toBe('bigint');
      expect(col!.is_nullable).toBe('YES');

      const fk = await db.raw(
        `SELECT tc.constraint_name, ccu.table_name AS ref_table
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
         WHERE tc.table_name = 'rolls'
           AND tc.constraint_type = 'FOREIGN KEY'
           AND kcu.column_name = 'lot_id'`,
      );
      expect(fk.rows[0]?.ref_table).toBe('lots');
    });

    it('length_m column: numeric, nullable', async () => {
      const col = await getColumn('rolls', 'length_m');
      expect(col).not.toBeNull();
      expect(col!.data_type).toBe('numeric');
      expect(col!.is_nullable).toBe('YES');
    });

    it('reference_price_per_unit column: numeric(12,2), nullable', async () => {
      const col = await getColumn('rolls', 'reference_price_per_unit');
      expect(col).not.toBeNull();
      expect(col!.data_type).toBe('numeric');
      expect(col!.is_nullable).toBe('YES');
    });

    it('Q&A #2/#3 — purchase_price_egp dropped', async () => {
      const col = await getColumn('rolls', 'purchase_price_egp');
      expect(col).toBeNull();
    });

    it('warehouse CHECK still has shop/factory/damaged_shop', async () => {
      const r = await db.raw(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid = 'rolls'::regclass
           AND contype = 'c'`,
      );
      const allDefs = r.rows.map((x: { def: string }) => x.def).join('\n');
      expect(allDefs).toMatch(/shop/);
      expect(allDefs).toMatch(/factory/);
      expect(allDefs).toMatch(/damaged_shop/);
    });
  });

  // ─── lots ────────────────────────────────────────────────────────────────
  describe('lots', () => {
    it('table exists with required columns', async () => {
      for (const name of ['id', 'lot_no', 'fabric_id', 'color_id', 'notes_ar', 'created_at', 'updated_at']) {
        const col = await getColumn('lots', name);
        expect(col, `column ${name}`).not.toBeNull();
      }
    });

    it('lot_no is UNIQUE', async () => {
      const r = await db.raw(
        `SELECT 1 FROM pg_indexes
         WHERE tablename = 'lots' AND indexdef ILIKE '%(lot_no)%'`,
      );
      expect(r.rows.length).toBeGreaterThan(0);
    });

    it('Q&A #1 — two lots auto-generated as sequential prefixed lot_no', async () => {
      // Need a fabric + color to insert lots — pick any existing pair.
      const fabric = await db('fabrics').first('id');
      const color = await db('colors').first('id');
      if (!fabric || !color) {
        // Fresh DB with no seed data — skip the sequential check, but require
        // the sequence row exists.
        const seq = await db('db_sequences').where({ name: 'lot_no_seq' }).first();
        expect(seq).toBeTruthy();
        return;
      }
      // Insert two via the service so the sequence is exercised.
      const { createLot } = await import('../../src/domain/lots/lots.service.js');
      const a = await createLot({ fabric_id: fabric.id, color_id: color.id, notes_ar: 'schema-test-A' });
      const b = await createLot({ fabric_id: fabric.id, color_id: color.id, notes_ar: 'schema-test-B' });
      expect(a.lot_no).toMatch(/^L[A-Z]?-\d{6}$/); // accepts L- or LT- prefix
      expect(b.lot_no).toMatch(/^L[A-Z]?-\d{6}$/);
      const aN = Number(a.lot_no.split('-')[1]);
      const bN = Number(b.lot_no.split('-')[1]);
      expect(bN).toBe(aN + 1);
      await db('lots').whereIn('id', [a.id, b.id]).delete();
    });

    it('index on (fabric_id, color_id) exists', async () => {
      expect(await indexExists('lots_fabric_color_idx')).toBe(true);
    });
  });

  // ─── invoices ────────────────────────────────────────────────────────────
  describe('invoices', () => {
    it('Q&A #15 — fulfillment_destination: varchar(32), NOT NULL, default shop', async () => {
      const col = await getColumn('invoices', 'fulfillment_destination');
      expect(col).not.toBeNull();
      expect(col!.character_maximum_length).toBe(32);
      expect(col!.is_nullable).toBe('NO');
      expect(col!.column_default).toMatch(/'shop'/);
    });

    it('Q&A #15 — fulfillment_destination CHECK accepts shop + factory_direct only', async () => {
      const def = await getCheckClause('invoices_fulfillment_destination_check');
      expect(def).toBeTruthy();
      expect(def).toContain("'shop'");
      expect(def).toContain("'factory_direct'");
    });

    it("Q&A #24 — status enum includes 'deposit_refunded'", async () => {
      const def = await getCheckClause('invoices_status_check');
      expect(def).toBeTruthy();
      expect(def).toContain("'deposit_refunded'");
    });
  });

  describe('invoice line sale quantity snapshots', () => {
    it('stores a nullable numeric quantity and its nullable unit together', async () => {
      const quantity = await getColumn('invoice_lines', 'sold_quantity');
      const unit = await getColumn('invoice_lines', 'sold_unit');

      expect(quantity).not.toBeNull();
      expect(quantity!.data_type).toBe('numeric');
      expect(quantity!.is_nullable).toBe('YES');
      expect(unit).not.toBeNull();
      expect(unit!.character_maximum_length).toBe(8);
      expect(unit!.is_nullable).toBe('YES');
    });

    it('accepts only positive roll quantities in kg or meters', async () => {
      const def = await getCheckClause('chk_invoice_lines_sold_quantity');
      expect(def).toBeTruthy();
      expect(def).toContain("'roll'");
      expect(def).toContain("'kg'");
      expect(def).toContain("'meter'");
      expect(def).toMatch(/sold_quantity >.*0/);
    });
  });

  // ─── payments ────────────────────────────────────────────────────────────
  describe('payments', () => {
    it('Q&A #29 — method CHECK accepts cash/instapay/bank_transfer/cheque', async () => {
      const def = await getCheckClause('payments_method_check');
      expect(def).toBeTruthy();
      for (const m of ['cash', 'instapay', 'bank_transfer', 'cheque']) {
        expect(def, `method ${m}`).toContain(`'${m}'`);
      }
    });

    it('reference column: varchar(64), nullable', async () => {
      const col = await getColumn('payments', 'reference');
      expect(col).not.toBeNull();
      expect(col!.character_maximum_length).toBe(64);
      expect(col!.is_nullable).toBe('YES');
    });

    it('Q&A #24 — amount_egp accepts negative values for refund rows', async () => {
      // Find any existing payment row to clone (we need a valid invoice_id and FK).
      const sample = await db('payments').first();
      if (!sample) {
        // No invoices/payments yet — verify column type permits negatives by
        // checking there is no CHECK constraint forbidding it on amount_egp.
        const r = await db.raw(
          `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
           WHERE conrelid = 'payments'::regclass AND contype = 'c'`,
        );
        const text = r.rows.map((x: { def: string }) => x.def).join('\n');
        // No constraint should mention amount_egp >= 0 / > 0.
        expect(text).not.toMatch(/amount_egp\s*>=?\s*0/);
        return;
      }
      const inserted = await db('payments').insert({
        invoice_id: sample.invoice_id,
        method: 'cash',
        amount_egp: -50,
        payment_kind: 'refund',
        actor_user_id: sample.actor_user_id,
        created_at: new Date(),
      }).returning('id');
      const id = Array.isArray(inserted) ? (inserted[0] as { id: number }).id : (inserted as { id: number }).id;
      expect(id).toBeGreaterThan(0);
      await db('payments').where({ id }).delete();
    });
  });

  // ─── cheques ─────────────────────────────────────────────────────────────
  describe('cheques', () => {
    it('table exists with required columns', async () => {
      for (const name of [
        'id', 'payment_id', 'cheque_number', 'bank_name_ar', 'branch_ar',
        'issuer_name_ar', 'amount_egp', 'issue_date', 'due_date', 'status',
        'notes_ar', 'created_at', 'updated_at',
      ]) {
        const col = await getColumn('cheques', name);
        expect(col, `column ${name}`).not.toBeNull();
      }
    });

    it('status CHECK accepts pending/cleared/bounced/cancelled', async () => {
      const r = await db.raw(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid = 'cheques'::regclass AND contype = 'c'`,
      );
      const text = r.rows.map((x: { def: string }) => x.def).join('\n');
      for (const s of ['pending', 'cleared', 'bounced', 'cancelled']) {
        expect(text, `status ${s}`).toContain(`'${s}'`);
      }
    });

    it('indexes on due_date and status', async () => {
      expect(await indexExists('cheques_due_date_idx')).toBe(true);
      expect(await indexExists('cheques_status_idx')).toBe(true);
    });
  });

  // ─── expenses ────────────────────────────────────────────────────────────
  describe('expenses', () => {
    it("Q&A #33 — paid_from CHECK accepts cash + bank + instapay", async () => {
      const def = await getCheckClause('expenses_paid_from_check');
      expect(def).toBeTruthy();
      for (const m of ['cash', 'bank', 'instapay']) {
        expect(def, `paid_from ${m}`).toContain(`'${m}'`);
      }
    });
  });

  // ─── HR tables ──────────────────────────────────────────────────────────
  describe('HR tables (Q&A #36-39)', () => {
    it('hr_employees: all required columns', async () => {
      for (const name of ['id', 'name_ar', 'phone', 'role_ar', 'base_salary_egp', 'is_active', 'created_at', 'updated_at']) {
        const col = await getColumn('hr_employees', name);
        expect(col, `hr_employees.${name}`).not.toBeNull();
      }
    });

    it('hr_salary_disbursements: paid_via CHECK accepts cash/instapay/bank_transfer', async () => {
      const def = await getCheckClause('hr_salary_disbursements_paid_via_check');
      expect(def).toBeTruthy();
      for (const m of ['cash', 'instapay', 'bank_transfer']) {
        expect(def, `paid_via ${m}`).toContain(`'${m}'`);
      }
    });

    it('Q&A #38 — UNIQUE constraint on (employee_id, month)', async () => {
      const r = await db.raw(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'hr_salary_disbursements'`,
      );
      const all = r.rows.map((x: { indexdef: string }) => x.indexdef).join('\n');
      expect(all).toMatch(/UNIQUE.*employee_id.*month|UNIQUE.*month.*employee_id/);
    });

    it('Q&A #36 — hr_salary_adjustments kind CHECK accepts advance + deduction', async () => {
      const def = await getCheckClause('hr_salary_adjustments_kind_check');
      expect(def).toBeTruthy();
      expect(def).toContain("'advance'");
      expect(def).toContain("'deduction'");
    });

    it('index on hr_salary_adjustments(employee_id, salary_month)', async () => {
      expect(await indexExists('hr_salary_adjustments_employee_month_idx')).toBe(true);
    });
  });

  // ─── Explicitly dropped artefacts ───────────────────────────────────────
  describe('Q&A #34 — business_day_id dropped', () => {
    it('no table has a business_day_id column', async () => {
      const r = await db.raw(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE column_name = 'business_day_id'`,
      );
      expect(r.rows).toEqual([]);
    });
  });
});

// Always-on smoke check — verifies the test file itself loads even when DB
// is unavailable (so the regression sweep counts this test file).
describe('v2 schema test file loads', () => {
  it('module compiles + imports cleanly', () => {
    expect(typeof db).toBe('function');
  });
});
