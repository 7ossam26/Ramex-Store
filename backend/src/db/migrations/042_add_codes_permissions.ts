import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const perms = [
    { role: 'shop_seller',    resource: 'codes',        action: 'read',  is_allowed: true  },
    { role: 'shop_seller',    resource: 'codes',        action: 'write', is_allowed: false },
    { role: 'factory_sender', resource: 'codes',        action: 'read',  is_allowed: true  },
    { role: 'factory_sender', resource: 'codes',        action: 'write', is_allowed: false },
    { role: 'shop_seller',    resource: 'fabric_rolls', action: 'read',  is_allowed: true  },
    { role: 'shop_seller',    resource: 'fabric_rolls', action: 'write', is_allowed: true  },
    { role: 'factory_sender', resource: 'fabric_rolls', action: 'read',  is_allowed: false },
    { role: 'factory_sender', resource: 'fabric_rolls', action: 'write', is_allowed: false },
  ];

  await knex('role_permissions')
    .insert(perms)
    .onConflict(['role', 'resource', 'action'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions')
    .whereIn('resource', ['codes', 'fabric_rolls'])
    .delete();
}
