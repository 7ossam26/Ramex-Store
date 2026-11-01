/**
 * Migration 105 — role defaults for the new stock-request resources.
 *
 * DATA SOURCE: shared/permissions/catalog.ts (ROLE_DEFAULTS), mirrored inline
 * (same reason as migration 072: backend rootDir boundary). A test asserts parity.
 *
 *   stock_requests            the SHOP side: ask / cancel / ask for replacements
 *     owner           read + write
 *     shop_seller     read + write
 *     factory_sender  read only
 *     accountant      read only
 *
 *   stock_request_fulfilment  the FACTORY side: open the linked draft, mark an item unavailable
 *     owner           write
 *     factory_sender  write
 *     shop_seller     NO   (the shop must never prepare its own request)
 *     accountant      NO
 *
 * Why a separate resource instead of the existing shipments.write: the stored
 * matrix grants shop_seller shipments.write = true (seeded by migration 037 and never
 * corrected by 072, which only inserts missing rows), although the catalog says false.
 * Reusing shipments.write would let the shop prepare its own requests. This
 * migration deliberately does NOT touch any existing permission row.
 *
 *   super_admin is always allowed in code (no row needed).
 *
 * Strategy (same as 072): onConflict().ignore(), so existing rows are never
 * overwritten; the ids and seeded values of inserted rows are recorded in
 * _seed_audit_105.
 *
 * ROLLBACK NEVER DESTROYS CONFIGURATION: down() refuses if any per-user
 * override for these resources exists, or if an admin changed a seeded row.
 */

import type { Knex } from 'knex';

type Seed = { role: string; resource: string; action: 'read' | 'write'; is_allowed: boolean };

const REQ = 'stock_requests';
const FUL = 'stock_request_fulfilment';

const SEEDS: Seed[] = [
  { role: 'owner',          resource: REQ, action: 'read',  is_allowed: true  },
  { role: 'owner',          resource: REQ, action: 'write', is_allowed: true  },
  { role: 'shop_seller',    resource: REQ, action: 'read',  is_allowed: true  },
  { role: 'shop_seller',    resource: REQ, action: 'write', is_allowed: true  },
  { role: 'factory_sender', resource: REQ, action: 'read',  is_allowed: true  },
  { role: 'factory_sender', resource: REQ, action: 'write', is_allowed: false },
  { role: 'accountant',     resource: REQ, action: 'read',  is_allowed: true  },
  { role: 'accountant',     resource: REQ, action: 'write', is_allowed: false },

  { role: 'owner',          resource: FUL, action: 'write', is_allowed: true  },
  { role: 'factory_sender', resource: FUL, action: 'write', is_allowed: true  },
  { role: 'shop_seller',    resource: FUL, action: 'write', is_allowed: false },
  { role: 'accountant',     resource: FUL, action: 'write', is_allowed: false },
];

const RESOURCES = [REQ, FUL];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('_seed_audit_105', (t) => {
    t.bigIncrements('id');
    t.bigInteger('role_permission_id').notNullable();
    t.boolean('seeded_is_allowed').notNullable();
  });

  for (const s of SEEDS) {
    const inserted = await knex('role_permissions')
      .insert({ role: s.role, resource: s.resource, action: s.action, is_allowed: s.is_allowed })
      .onConflict(['role', 'resource', 'action'])
      .ignore()
      .returning('id');

    if (inserted.length > 0 && inserted[0]) {
      const first = inserted[0] as { id: number } | number;
      const id = typeof first === 'object' ? first.id : first;
      await knex('_seed_audit_105').insert({ role_permission_id: id, seeded_is_allowed: s.is_allowed });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const overrides = Number(
    (await knex('user_permission_overrides').whereIn('resource', RESOURCES).count<{ n: string }[]>({ n: '*' }))[0].n,
  );
  if (overrides > 0) {
    throw new Error(
      `Refusing to roll back migration 105: ${overrides} per-user permission override(s) for ` +
      `${RESOURCES.map((r) => `'${r}'`).join(', ')} exist. Nothing was deleted. Remove them deliberately first.`,
    );
  }

  const audit = await knex('_seed_audit_105').select('role_permission_id', 'seeded_is_allowed') as
    Array<{ role_permission_id: number | string; seeded_is_allowed: boolean }>;

  const customised: string[] = [];
  for (const a of audit) {
    const row = await knex('role_permissions').where({ id: a.role_permission_id }).first('role', 'resource', 'action', 'is_allowed');
    if (row && row.is_allowed !== a.seeded_is_allowed) customised.push(`${row.role}.${row.resource}.${row.action}`);
  }
  if (customised.length > 0) {
    throw new Error(
      `Refusing to roll back migration 105: seeded permission(s) were customised by an admin ` +
      `(${customised.join(', ')}). Nothing was deleted.`,
    );
  }

  const ids = audit.map((a) => a.role_permission_id);
  if (ids.length > 0) {
    await knex('role_permissions').whereIn('id', ids).delete();
  }
  await knex.schema.dropTableIfExists('_seed_audit_105');
}
