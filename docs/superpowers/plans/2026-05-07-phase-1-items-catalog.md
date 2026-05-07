# Phase 1 — Items & Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Module 3 (fabric catalog) — 5 DB migrations, 4 backend services + controllers + routes, and 4 frontend pages (fabrics, colors, default prices, rolls/توب).

**Architecture:** Five sequential Knex migrations build `fabrics → colors → fabric_color_prices → rolls` (+ a PG sequence for barcode generation); a single `backend/src/domain/items/` directory holds per-resource services and controllers all mounted on one `itemsRouter`; four React pages consume TanStack Query v5 hooks from a central `frontend/src/lib/items-api.ts`.

**Tech Stack:** Knex + PostgreSQL (pg), Zod, Express, React 18, TanStack Query v5, react-hook-form + @hookform/resolvers/zod, shadcn/ui (Dialog, Button, Input, Label), lucide-react, Tailwind RTL.

---

## File Map

**Backend — Create:**
- `backend/src/db/migrations/005_create_fabrics.ts`
- `backend/src/db/migrations/006_create_colors.ts`
- `backend/src/db/migrations/007_create_fabric_color_prices.ts`
- `backend/src/db/migrations/008_create_rolls.ts`
- `backend/src/db/seeds/002_seed_lookup_tables.ts`
- `backend/src/domain/items/items.types.ts`
- `backend/src/domain/items/items.schemas.ts`
- `backend/src/domain/items/fabrics.service.ts`
- `backend/src/domain/items/colors.service.ts`
- `backend/src/domain/items/prices.service.ts`
- `backend/src/domain/items/rolls.service.ts`
- `backend/src/domain/items/fabrics.controller.ts`
- `backend/src/domain/items/colors.controller.ts`
- `backend/src/domain/items/prices.controller.ts`
- `backend/src/domain/items/rolls.controller.ts`
- `backend/src/domain/items/items.routes.ts`
- `backend/tests/items.test.ts`

**Backend — Modify:**
- `backend/src/api/routes.ts` — import + mount `itemsRouter`

**Frontend — Create:**
- `frontend/src/lib/items-api.ts`
- `frontend/src/pages/items/FabricsPage.tsx`
- `frontend/src/pages/items/ColorsPage.tsx`
- `frontend/src/pages/items/PricesPage.tsx`
- `frontend/src/pages/items/RollsPage.tsx`

**Frontend — Modify:**
- `frontend/src/i18n/ar.ts` — add `topbar.items` + top-level `items` namespace
- `frontend/src/components/Layout/TopBar.tsx` — add الأصناف dropdown
- `frontend/src/App.tsx` — add `/items/*` routes

---

## Task 1: Migration 005 — fabrics table

**Files:**
- Create: `backend/src/db/migrations/005_create_fabrics.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('fabrics', (t) => {
    t.bigIncrements('id').primary();
    t.string('code', 32).notNullable().unique();
    t.string('name_ar', 128).notNullable();
    t.jsonb('composition').notNullable(); // [{material: string, percent: number}]
    t.decimal('width_cm', 6, 2).notNullable();
    t.string('grade', 16).notNullable();
    t.text('notes').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('fabrics');
}
```

- [ ] **Step 2: Verify syntax with typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 2: Migration 006 — colors table

**Files:**
- Create: `backend/src/db/migrations/006_create_colors.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('colors', (t) => {
    t.bigIncrements('id').primary();
    t.string('name_ar', 64).notNullable();
    t.string('code', 16).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.unique(['name_ar', 'code']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('colors');
}
```

- [ ] **Step 2: Verify syntax with typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 3: Migration 007 — fabric_color_prices table

**Files:**
- Create: `backend/src/db/migrations/007_create_fabric_color_prices.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('fabric_color_prices', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('fabric_id').unsigned().notNullable()
      .references('id').inTable('fabrics').onDelete('RESTRICT');
    t.bigInteger('color_id').unsigned().notNullable()
      .references('id').inTable('colors').onDelete('RESTRICT');
    t.decimal('default_price_per_kg', 10, 2).notNullable();
    t.decimal('default_price_per_roll', 10, 2).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.unique(['fabric_id', 'color_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('fabric_color_prices');
}
```

- [ ] **Step 2: Verify syntax with typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 4: Migration 008 — rolls table + ENUMs + barcode sequence

**Files:**
- Create: `backend/src/db/migrations/008_create_rolls.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.raw(`CREATE TYPE roll_status AS ENUM ('in_stock','reserved','sold','damaged','sample','returned','written_off')`);
  await db.raw(`CREATE TYPE roll_warehouse AS ENUM ('shop','factory','damaged_shop')`);
  await db.raw(`CREATE SEQUENCE IF NOT EXISTS roll_barcode_seq START 1`);

  await db.schema.createTable('rolls', (t) => {
    t.bigIncrements('id').primary();
    t.string('internal_barcode', 32).notNullable().unique();
    t.string('external_barcode', 64).nullable();
    t.bigInteger('fabric_id').unsigned().notNullable()
      .references('id').inTable('fabrics').onDelete('RESTRICT');
    t.bigInteger('color_id').unsigned().notNullable()
      .references('id').inTable('colors').onDelete('RESTRICT');
    t.string('roll_sr_no', 32).nullable();
    t.string('order_no', 32).nullable();
    t.decimal('weight_kg', 10, 3).notNullable();
    t.decimal('purchase_price_egp', 10, 2).nullable();
    t.decimal('selling_price_egp', 10, 2).notNullable();
    t.specificType('status', 'roll_status').notNullable().defaultTo('in_stock');
    t.specificType('warehouse', 'roll_warehouse').notNullable();
    t.boolean('is_visible_at_pos').notNullable().defaultTo(true);
    t.timestamp('received_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
  });

  await db.raw(`CREATE INDEX rolls_fabric_color_status_idx ON rolls(fabric_id, color_id, status)`);
  await db.raw(`CREATE INDEX rolls_warehouse_status_idx ON rolls(warehouse, status)`);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('rolls');
  await db.raw(`DROP SEQUENCE IF EXISTS roll_barcode_seq`);
  await db.raw(`DROP TYPE IF EXISTS roll_warehouse`);
  await db.raw(`DROP TYPE IF EXISTS roll_status`);
}
```

- [ ] **Step 2: Verify syntax with typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 5: Dev seed — colors + fabric + prices

**Files:**
- Create: `backend/src/db/seeds/002_seed_lookup_tables.ts`

- [ ] **Step 1: Create the seed file**

```typescript
import type { Knex } from 'knex';

export async function seed(db: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  // Idempotent: skip if sample data already present
  const exists = await db('colors').where({ code: '101' }).first();
  if (exists) return;

  const [colorRow1] = await db('colors')
    .insert({ name_ar: 'أبيض', code: '101' })
    .returning('id');
  const [colorRow2] = await db('colors')
    .insert({ name_ar: 'أسود', code: '201' })
    .returning('id');

  const [fabricRow] = await db('fabrics')
    .insert({
      code: 'MILTON-P8',
      name_ar: 'ميلتون P8',
      composition: JSON.stringify([{ material: 'قطن', percent: 100 }]),
      width_cm: 150.00,
      grade: '1K',
      notes: null,
      is_active: true,
    })
    .returning('id');

  await db('fabric_color_prices').insert([
    {
      fabric_id: fabricRow.id,
      color_id: colorRow1.id,
      default_price_per_kg: 120.00,
      default_price_per_roll: null,
    },
    {
      fabric_id: fabricRow.id,
      color_id: colorRow2.id,
      default_price_per_kg: 125.00,
      default_price_per_roll: null,
    },
  ]);
}
```

- [ ] **Step 2: Verify syntax with typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 6: Verify all migrations apply and rollback cleanly

- [ ] **Step 1: Run all migrations**

Run: `npm run db:migrate`
Expected: exits 0, migrations 005–008 listed as applied.

- [ ] **Step 2: Run rollback**

Run: `npm run db:migrate:rollback`
Expected: exits 0, batch rolled back cleanly (rolls table + ENUMs + sequence dropped, then fabric_color_prices, colors, fabrics).

- [ ] **Step 3: Re-apply + seed**

```bash
npm run db:migrate
npm run db:seed
```
Expected: both exit 0; seed inserts 2 colors, 1 fabric, 2 prices.

- [ ] **Step 4: Commit migrations + seed**

```bash
git add backend/src/db/migrations/005_create_fabrics.ts \
        backend/src/db/migrations/006_create_colors.ts \
        backend/src/db/migrations/007_create_fabric_color_prices.ts \
        backend/src/db/migrations/008_create_rolls.ts \
        backend/src/db/seeds/002_seed_lookup_tables.ts
git commit -m "feat(db): Phase 1 migrations — fabrics, colors, prices, rolls + dev seed"
```

---

## Task 7: Backend shared types + Zod schemas

**Files:**
- Create: `backend/src/domain/items/items.types.ts`
- Create: `backend/src/domain/items/items.schemas.ts`

- [ ] **Step 1: Write items.types.ts**

```typescript
export type Fabric = {
  id: number;
  code: string;
  name_ar: string;
  composition: Array<{ material: string; percent: number }>;
  width_cm: string;
  grade: string;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Color = {
  id: number;
  name_ar: string;
  code: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type FabricColorPrice = {
  id: number;
  fabric_id: number;
  color_id: number;
  default_price_per_kg: string;
  default_price_per_roll: string | null;
  created_at: Date;
  updated_at: Date;
};

export type RollStatus =
  | 'in_stock' | 'reserved' | 'sold' | 'damaged'
  | 'sample' | 'returned' | 'written_off';

export type RollWarehouse = 'shop' | 'factory' | 'damaged_shop';

export type Roll = {
  id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  color_id: number;
  roll_sr_no: string | null;
  order_no: string | null;
  weight_kg: string;
  purchase_price_egp: string | null;
  selling_price_egp: string;
  status: RollStatus;
  warehouse: RollWarehouse;
  is_visible_at_pos: boolean;
  received_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type RollWithDetails = Roll & {
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
};
```

- [ ] **Step 2: Write items.schemas.ts**

```typescript
import { z } from 'zod';

const CompositionItemSchema = z.object({
  material: z.string().min(1),
  percent: z.number().min(0).max(100),
});

export const CreateFabricSchema = z.object({
  code: z.string().min(1).max(32),
  name_ar: z.string().min(1).max(128),
  composition: z.array(CompositionItemSchema).min(1),
  width_cm: z.number().positive(),
  grade: z.string().min(1).max(16),
  notes: z.string().nullable().optional(),
});
export type CreateFabricInput = z.infer<typeof CreateFabricSchema>;

export const UpdateFabricSchema = CreateFabricSchema.extend({
  is_active: z.boolean().optional(),
}).partial();
export type UpdateFabricInput = z.infer<typeof UpdateFabricSchema>;

export const CreateColorSchema = z.object({
  name_ar: z.string().min(1).max(64),
  code: z.string().min(1).max(16),
});
export type CreateColorInput = z.infer<typeof CreateColorSchema>;

export const UpdateColorSchema = CreateColorSchema.extend({
  is_active: z.boolean().optional(),
}).partial();
export type UpdateColorInput = z.infer<typeof UpdateColorSchema>;

export const UpsertPriceSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  default_price_per_kg: z.number().positive(),
  default_price_per_roll: z.number().positive().nullable().optional(),
});
export type UpsertPriceInput = z.infer<typeof UpsertPriceSchema>;

export const RollStatusEnum = z.enum([
  'in_stock', 'reserved', 'sold', 'damaged', 'sample', 'returned', 'written_off',
]);
export const RollWarehouseEnum = z.enum(['shop', 'factory', 'damaged_shop']);

export const CreateRollSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  weight_kg: z.number().positive(),
  warehouse: RollWarehouseEnum,
  roll_sr_no: z.string().max(32).nullable().optional(),
  order_no: z.string().max(32).nullable().optional(),
  external_barcode: z.string().max(64).nullable().optional(),
  purchase_price_egp: z.number().positive().nullable().optional(),
  selling_price_egp: z.number().positive().optional(),
  is_visible_at_pos: z.boolean().optional().default(true),
});
export type CreateRollInput = z.infer<typeof CreateRollSchema>;

export const UpdateRollSchema = z.object({
  roll_sr_no: z.string().max(32).nullable().optional(),
  order_no: z.string().max(32).nullable().optional(),
  external_barcode: z.string().max(64).nullable().optional(),
  purchase_price_egp: z.number().positive().nullable().optional(),
  selling_price_egp: z.number().positive().optional(),
  weight_kg: z.number().positive().optional(),
  warehouse: RollWarehouseEnum.optional(),
  status: RollStatusEnum.optional(),
  is_visible_at_pos: z.boolean().optional(),
});
export type UpdateRollInput = z.infer<typeof UpdateRollSchema>;

export const ListRollsQuerySchema = z.object({
  fabric_id: z.coerce.number().int().positive().optional(),
  color_id: z.coerce.number().int().positive().optional(),
  status: RollStatusEnum.optional(),
  warehouse: RollWarehouseEnum.optional(),
  is_visible_at_pos: z.coerce.boolean().optional(),
});
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 8: fabrics.service.ts

**Files:**
- Create: `backend/src/domain/items/fabrics.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { db } from '../../db/connection.js';
import type { Fabric } from './items.types.js';
import type { CreateFabricInput, UpdateFabricInput } from './items.schemas.js';

export async function listFabrics(): Promise<Fabric[]> {
  return db('fabrics').orderBy('code');
}

export async function getFabric(id: number): Promise<Fabric | undefined> {
  return db('fabrics').where({ id }).first();
}

export async function createFabric(data: CreateFabricInput): Promise<Fabric> {
  const [row] = await db('fabrics')
    .insert({ ...data, composition: JSON.stringify(data.composition) })
    .returning('*');
  return row;
}

export async function updateFabric(id: number, data: UpdateFabricInput): Promise<Fabric | undefined> {
  const patch: Record<string, unknown> = { ...data, updated_at: db.fn.now() };
  if (data.composition !== undefined) {
    patch.composition = JSON.stringify(data.composition);
  }
  const [row] = await db('fabrics').where({ id }).update(patch).returning('*');
  return row;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 9: colors.service.ts

**Files:**
- Create: `backend/src/domain/items/colors.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { db } from '../../db/connection.js';
import type { Color } from './items.types.js';
import type { CreateColorInput, UpdateColorInput } from './items.schemas.js';

export async function listColors(): Promise<Color[]> {
  return db('colors').orderBy('name_ar');
}

export async function getColor(id: number): Promise<Color | undefined> {
  return db('colors').where({ id }).first();
}

export async function createColor(data: CreateColorInput): Promise<Color> {
  const [row] = await db('colors').insert(data).returning('*');
  return row;
}

export async function updateColor(id: number, data: UpdateColorInput): Promise<Color | undefined> {
  const [row] = await db('colors')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*');
  return row;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 10: prices.service.ts

**Files:**
- Create: `backend/src/domain/items/prices.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { db } from '../../db/connection.js';
import type { FabricColorPrice } from './items.types.js';
import type { UpsertPriceInput } from './items.schemas.js';

export async function listPrices(): Promise<FabricColorPrice[]> {
  return db('fabric_color_prices').orderBy('fabric_id').orderBy('color_id');
}

export async function getPrice(
  fabricId: number,
  colorId: number,
): Promise<FabricColorPrice | undefined> {
  return db('fabric_color_prices')
    .where({ fabric_id: fabricId, color_id: colorId })
    .first();
}

export async function upsertPrice(data: UpsertPriceInput): Promise<FabricColorPrice> {
  const [row] = await db('fabric_color_prices')
    .insert({ ...data, updated_at: db.fn.now() })
    .onConflict(['fabric_id', 'color_id'])
    .merge(['default_price_per_kg', 'default_price_per_roll', 'updated_at'])
    .returning('*');
  return row;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 11: rolls.service.ts

**Files:**
- Create: `backend/src/domain/items/rolls.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { db } from '../../db/connection.js';
import type { Roll, RollWithDetails } from './items.types.js';
import type { CreateRollInput, UpdateRollInput } from './items.schemas.js';

async function generateBarcode(): Promise<string> {
  const result = await db.raw<{ rows: Array<{ n: string }> }>(
    `SELECT nextval('roll_barcode_seq') AS n`,
  );
  const n = Number(result.rows[0].n);
  return `RMX-R-${String(n).padStart(6, '0')}`;
}

const ROLL_DETAIL_COLS = [
  'r.*',
  'f.code as fabric_code',
  'f.name_ar as fabric_name_ar',
  'c.name_ar as color_name_ar',
  'c.code as color_code',
] as const;

function rollDetailQuery() {
  return db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .select(...ROLL_DETAIL_COLS);
}

export async function listRolls(filters: {
  fabric_id?: number;
  color_id?: number;
  status?: string;
  warehouse?: string;
  is_visible_at_pos?: boolean;
}): Promise<RollWithDetails[]> {
  const q = rollDetailQuery().orderBy('r.id', 'desc');
  if (filters.fabric_id !== undefined) q.where('r.fabric_id', filters.fabric_id);
  if (filters.color_id !== undefined) q.where('r.color_id', filters.color_id);
  if (filters.status !== undefined) q.where('r.status', filters.status);
  if (filters.warehouse !== undefined) q.where('r.warehouse', filters.warehouse);
  if (filters.is_visible_at_pos !== undefined) {
    q.where('r.is_visible_at_pos', filters.is_visible_at_pos);
  }
  return q;
}

export async function getRoll(id: number): Promise<RollWithDetails | undefined> {
  return rollDetailQuery().where('r.id', id).first();
}

export async function createRoll(data: CreateRollInput): Promise<Roll> {
  let sellingPrice = data.selling_price_egp;

  if (sellingPrice === undefined) {
    const priceRow = await db('fabric_color_prices')
      .where({ fabric_id: data.fabric_id, color_id: data.color_id })
      .first();
    if (!priceRow) throw new Error('NO_DEFAULT_PRICE');
    sellingPrice = Number(priceRow.default_price_per_kg);
  }

  const internal_barcode = await generateBarcode();
  const [row] = await db('rolls')
    .insert({ ...data, selling_price_egp: sellingPrice, internal_barcode })
    .returning('*');
  return row;
}

export async function updateRoll(
  id: number,
  data: UpdateRollInput,
): Promise<Roll | undefined> {
  const existing = await db('rolls').where({ id }).first();
  if (!existing) return undefined;

  // Price + weight are locked once sold
  const patch = { ...data } as Record<string, unknown>;
  if (existing.status === 'sold') {
    delete patch.selling_price_egp;
    delete patch.weight_kg;
  }

  const [row] = await db('rolls')
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning('*');
  return row;
}

export async function togglePosVisibility(id: number): Promise<Roll | undefined> {
  const existing = await db('rolls').where({ id }).first();
  if (!existing) return undefined;
  const [row] = await db('rolls')
    .where({ id })
    .update({ is_visible_at_pos: !existing.is_visible_at_pos, updated_at: db.fn.now() })
    .returning('*');
  return row;
}

export async function findByBarcode(barcode: string): Promise<RollWithDetails | undefined> {
  return rollDetailQuery()
    .where('r.internal_barcode', barcode)
    .orWhere('r.external_barcode', barcode)
    .first();
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 12: fabrics.controller.ts

**Files:**
- Create: `backend/src/domain/items/fabrics.controller.ts`

- [ ] **Step 1: Write the controller**

```typescript
import type { Request, Response } from 'express';
import { CreateFabricSchema, UpdateFabricSchema } from './items.schemas.js';
import * as svc from './fabrics.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listFabrics(req: Request, res: Response): Promise<void> {
  res.json(await svc.listFabrics());
}

export async function createFabric(req: Request, res: Response): Promise<void> {
  const data = CreateFabricSchema.parse(req.body);
  const fabric = await svc.createFabric(data);
  await auditLog(req, 'create_fabric', 'fabric', fabric.id, null, fabric, { severity: 'low' });
  res.status(201).json(fabric);
}

export async function updateFabric(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateFabricSchema.parse(req.body);
  const before = await svc.getFabric(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateFabric(id, data);
  await auditLog(req, 'update_fabric', 'fabric', id, before, after, { severity: 'low' });
  res.json(after);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 13: colors.controller.ts

**Files:**
- Create: `backend/src/domain/items/colors.controller.ts`

- [ ] **Step 1: Write the controller**

```typescript
import type { Request, Response } from 'express';
import { CreateColorSchema, UpdateColorSchema } from './items.schemas.js';
import * as svc from './colors.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listColors(req: Request, res: Response): Promise<void> {
  res.json(await svc.listColors());
}

export async function createColor(req: Request, res: Response): Promise<void> {
  const data = CreateColorSchema.parse(req.body);
  const color = await svc.createColor(data);
  await auditLog(req, 'create_color', 'color', color.id, null, color, { severity: 'low' });
  res.status(201).json(color);
}

export async function updateColor(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateColorSchema.parse(req.body);
  const before = await svc.getColor(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateColor(id, data);
  await auditLog(req, 'update_color', 'color', id, before, after, { severity: 'low' });
  res.json(after);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 14: prices.controller.ts

**Files:**
- Create: `backend/src/domain/items/prices.controller.ts`

- [ ] **Step 1: Write the controller**

```typescript
import type { Request, Response } from 'express';
import { UpsertPriceSchema } from './items.schemas.js';
import * as svc from './prices.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listPrices(req: Request, res: Response): Promise<void> {
  res.json(await svc.listPrices());
}

export async function upsertPrice(req: Request, res: Response): Promise<void> {
  const data = UpsertPriceSchema.parse(req.body);
  const before = await svc.getPrice(data.fabric_id, data.color_id);
  const price = await svc.upsertPrice(data);
  await auditLog(req, 'upsert_price', 'fabric_color_price', price.id, before ?? null, price, {
    severity: 'medium',
  });
  res.status(before ? 200 : 201).json(price);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 15: rolls.controller.ts

**Files:**
- Create: `backend/src/domain/items/rolls.controller.ts`

- [ ] **Step 1: Write the controller**

```typescript
import type { Request, Response } from 'express';
import { CreateRollSchema, UpdateRollSchema, ListRollsQuerySchema } from './items.schemas.js';
import * as svc from './rolls.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listRolls(req: Request, res: Response): Promise<void> {
  const filters = ListRollsQuerySchema.parse(req.query);
  res.json(await svc.listRolls(filters));
}

export async function createRoll(req: Request, res: Response): Promise<void> {
  const data = CreateRollSchema.parse(req.body);
  let roll;
  try {
    roll = await svc.createRoll(data);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NO_DEFAULT_PRICE') {
      res.status(422).json({
        error: 'لا يوجد سعر افتراضي لهذا الصنف واللون، يجب تحديد السعر يدوياً',
      });
      return;
    }
    throw e;
  }
  await auditLog(req, 'create_roll', 'roll', roll.id, null, roll, { severity: 'medium' });
  res.status(201).json(roll);
}

export async function updateRoll(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateRollSchema.parse(req.body);
  const before = await svc.getRoll(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateRoll(id, data);
  await auditLog(req, 'update_roll', 'roll', id, before, after, { severity: 'medium' });
  res.json(after);
}

export async function findByBarcode(req: Request, res: Response): Promise<void> {
  const roll = await svc.findByBarcode(req.params.barcode);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(roll);
}

export async function togglePosVisibility(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const before = await svc.getRoll(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.togglePosVisibility(id);
  await auditLog(
    req,
    'toggle_pos_visibility',
    'roll',
    id,
    { is_visible_at_pos: before.is_visible_at_pos },
    { is_visible_at_pos: after?.is_visible_at_pos },
    { severity: 'low' },
  );
  res.json(after);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w backend`
Expected: no errors

---

## Task 16: items.routes.ts + wire into api/routes.ts

**Files:**
- Create: `backend/src/domain/items/items.routes.ts`
- Modify: `backend/src/api/routes.ts`

- [ ] **Step 1: Write items.routes.ts**

```typescript
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as fabricsCtl from './fabrics.controller.js';
import * as colorsCtl from './colors.controller.js';
import * as pricesCtl from './prices.controller.js';
import * as rollsCtl from './rolls.controller.js';

export const itemsRouter = Router();

itemsRouter.use(requireAuth, requireActiveSession);

// Fabrics
itemsRouter.get('/fabrics', fabricsCtl.listFabrics);
itemsRouter.post('/fabrics', requireRole('owner'), fabricsCtl.createFabric);
itemsRouter.patch('/fabrics/:id', requireRole('owner'), fabricsCtl.updateFabric);

// Colors
itemsRouter.get('/colors', colorsCtl.listColors);
itemsRouter.post('/colors', requireRole('owner'), colorsCtl.createColor);
itemsRouter.patch('/colors/:id', requireRole('owner'), colorsCtl.updateColor);

// Prices
itemsRouter.get('/fabric-color-prices', pricesCtl.listPrices);
itemsRouter.post('/fabric-color-prices', requireRole('owner'), pricesCtl.upsertPrice);

// Rolls — by-barcode must come before /:id to avoid conflict
itemsRouter.get('/rolls/by-barcode/:barcode', rollsCtl.findByBarcode);
itemsRouter.get('/rolls', rollsCtl.listRolls);
itemsRouter.post('/rolls', requireRole('owner'), rollsCtl.createRoll);
itemsRouter.patch('/rolls/:id', requireRole('owner'), rollsCtl.updateRoll);
itemsRouter.post('/rolls/:id/toggle-pos-visibility', requireRole('owner'), rollsCtl.togglePosVisibility);
```

- [ ] **Step 2: Update api/routes.ts**

Replace the entire file content with:

```typescript
import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from '../domain/auth/auth.routes.js';
import { usersRouter } from '../domain/users/users.routes.js';
import { itemsRouter } from '../domain/items/items.routes.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/', itemsRouter);
```

- [ ] **Step 3: Verify typecheck + commit**

```bash
npm run typecheck -w backend
git add backend/src/domain/items/ backend/src/api/routes.ts
git commit -m "feat(backend): Phase 1 items domain — fabrics, colors, prices, rolls services + routes"
```

---

## Task 17: Backend integration test

**Files:**
- Create: `backend/tests/items.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';

describe('items API', () => {
  it('GET /api/fabrics requires auth', async () => {
    const res = await request(app).get('/api/fabrics');
    expect(res.status).toBe(401);
  });

  it('GET /api/colors requires auth', async () => {
    const res = await request(app).get('/api/colors');
    expect(res.status).toBe(401);
  });

  it('GET /api/fabric-color-prices requires auth', async () => {
    const res = await request(app).get('/api/fabric-color-prices');
    expect(res.status).toBe(401);
  });

  it('GET /api/rolls requires auth', async () => {
    const res = await request(app).get('/api/rolls');
    expect(res.status).toBe(401);
  });

  it.skipIf(!RUN_DB)('POST /api/fabrics returns 403 for non-owner', async () => {
    // Login as shop_seller first — requires a seller user in the DB
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'seller', password: 'ChangeMe123!' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/fabrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X', name_ar: 'test', composition: [{ material: 'قطن', percent: 100 }], width_cm: 100, grade: '1K' });
    expect(res.status).toBe(403);
  });

  it.skipIf(!RUN_DB)('Owner can create fabric → color → price → roll with auto-barcode', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'ChangeMe123!' });
    const token = loginRes.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      code: `TEST-${Date.now()}`,
      name_ar: 'خامة اختبار',
      composition: [{ material: 'بوليستر', percent: 100 }],
      width_cm: 120,
      grade: '2K',
    });
    expect(fabric.status).toBe(201);
    expect(fabric.body.id).toBeDefined();

    const color = await request(app).post('/api/colors').set(auth).send({
      name_ar: 'أزرق',
      code: `BLU-${Date.now()}`,
    });
    expect(color.status).toBe(201);

    await request(app).post('/api/fabric-color-prices').set(auth).send({
      fabric_id: fabric.body.id,
      color_id: color.body.id,
      default_price_per_kg: 99.50,
    });

    const roll = await request(app).post('/api/rolls').set(auth).send({
      fabric_id: fabric.body.id,
      color_id: color.body.id,
      weight_kg: 12.500,
      warehouse: 'shop',
    });
    expect(roll.status).toBe(201);
    expect(roll.body.internal_barcode).toMatch(/^RMX-R-\d{6}$/);
    expect(Number(roll.body.selling_price_egp)).toBe(99.50);

    const byBarcode = await request(app)
      .get(`/api/rolls/by-barcode/${roll.body.internal_barcode}`)
      .set(auth);
    expect(byBarcode.status).toBe(200);
    expect(byBarcode.body.id).toBe(roll.body.id);
  });
});
```

- [ ] **Step 2: Run the no-DB tests**

Run: `npm run test -w backend`
Expected: the 4 auth-guard tests PASS; the 2 `skipIf(!RUN_DB)` tests are skipped.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/items.test.ts
git commit -m "test(backend): items API auth-guard + smoke tests"
```

---

## Task 18: Frontend i18n + TopBar + App.tsx routing

**Files:**
- Modify: `frontend/src/i18n/ar.ts`
- Modify: `frontend/src/components/Layout/TopBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update ar.ts**

Replace the entire file with the extended version (keep all existing keys, add new ones):

```typescript
export const ar = {
  app: { name: 'رامكس ستور' },
  login: {
    title: 'تسجيل الدخول',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    submit: 'دخول',
    error: 'بيانات الدخول غير صحيحة',
  },
  topbar: {
    items: 'الأصناف',
    inventory: 'المخزون',
    sales: 'المبيعات',
    customers: 'العملاء',
    payments: 'الخزنة',
    invoices: 'الفواتير',
    reports: 'التقارير',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    profile: 'الملف الشخصي',
  },
  offline: 'لا يوجد اتصال بالإنترنت',
  loading: 'جاري التحميل...',
  home: { welcome: 'لوحة التحكم' },
  items: {
    fabrics: {
      title: 'الخامات',
      add: 'إضافة خامة',
      edit: 'تعديل الخامة',
      code: 'الكود',
      name: 'الاسم',
      composition: 'التركيب',
      width: 'العرض (سم)',
      grade: 'الدرجة',
      notes: 'ملاحظات',
      material: 'المادة',
      percent: 'النسبة %',
      addMaterial: 'إضافة مادة',
      active: 'نشط',
      inactive: 'غير نشط',
    },
    colors: {
      title: 'الألوان',
      add: 'إضافة لون',
      edit: 'تعديل اللون',
      name: 'الاسم',
      code: 'الكود',
    },
    prices: {
      title: 'الأسعار الافتراضية',
      pricePerKg: 'سعر الكيلو (ج.م.)',
      noPrice: '—',
      save: 'حفظ',
    },
    rolls: {
      title: 'التوب',
      add: 'إضافة طوب',
      edit: 'تعديل الطوب',
      internalBarcode: 'الباركود الداخلي',
      externalBarcode: 'الباركود الخارجي',
      fabric: 'الخامة',
      color: 'اللون',
      weight: 'الوزن (كج)',
      sellingPrice: 'سعر البيع (ج.م.)',
      purchasePrice: 'سعر الشراء (ج.م.)',
      status: 'الحالة',
      warehouse: 'المخزن',
      posVisibility: 'ظاهر في نقطة البيع',
      rollSrNo: 'رقم الطوب (مصنع)',
      orderNo: 'رقم الطلبية',
      autoPrice: 'يُملأ تلقائياً من الأسعار الافتراضية',
      statuses: {
        in_stock: 'في المخزن',
        reserved: 'محجوز',
        sold: 'مباع',
        damaged: 'تالف',
        sample: 'عينة',
        returned: 'مرتجع',
        written_off: 'مشطوب',
      },
      warehouses: {
        shop: 'مخزن المحل',
        factory: 'مخزن المصنع',
        damaged_shop: 'تالف المحل',
      },
      allStatuses: 'كل الحالات',
      allWarehouses: 'كل المخازن',
      allFabrics: 'كل الخامات',
      allColors: 'كل الألوان',
    },
    save: 'حفظ',
    cancel: 'إلغاء',
    active: 'نشط',
    inactive: 'غير نشط',
    notFound: 'لا توجد بيانات',
    loading: 'جاري التحميل...',
    error: 'حدث خطأ، يرجى المحاولة مرة أخرى',
  },
} as const;
```

- [ ] **Step 2: Update TopBar.tsx — add الأصناف dropdown**

Replace the file content with:

```tsx
import { ModuleDropdown } from './ModuleDropdown';
import { UserMenu } from './UserMenu';
import { ar } from '@/i18n/ar';

export function TopBar() {
  return (
    <header className="h-14 bg-canvas border-b border-border flex items-center px-4 gap-4">
      <div className="size-9 rounded bg-primary text-primary-foreground inline-flex items-center justify-center font-bold">
        R
      </div>
      <nav className="flex items-center gap-1 flex-1">
        <ModuleDropdown
          label={ar.topbar.items}
          items={[
            { label: 'الخامات', href: '/items/fabrics' },
            { label: 'الألوان', href: '/items/colors' },
            { label: 'الأسعار الافتراضية', href: '/items/prices' },
            { label: 'التوب', href: '/items/rolls' },
          ]}
        />
        <ModuleDropdown label={ar.topbar.inventory} items={[{ label: 'المخزون', href: '/inventory' }]} />
        <ModuleDropdown label={ar.topbar.sales} items={[{ label: 'نقطة البيع', href: '/pos' }]} />
        <ModuleDropdown label={ar.topbar.customers} items={[{ label: 'قائمة العملاء', href: '/customers' }]} />
        <ModuleDropdown label={ar.topbar.payments} items={[{ label: 'الخزنة', href: '/cash' }]} />
        <ModuleDropdown label={ar.topbar.invoices} items={[{ label: 'الفواتير', href: '/invoices' }]} />
        <ModuleDropdown label={ar.topbar.reports} items={[{ label: 'تقرير اليوم', href: '/reports/daily' }]} />
        <ModuleDropdown label={ar.topbar.settings} items={[{ label: 'الإعدادات العامة', href: '/settings' }]} />
      </nav>
      <UserMenu />
    </header>
  );
}
```

- [ ] **Step 3: Update App.tsx — add /items/* routes**

Replace the file content with:

```tsx
import { Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { FabricsPage } from './pages/items/FabricsPage';
import { ColorsPage } from './pages/items/ColorsPage';
import { PricesPage } from './pages/items/PricesPage';
import { RollsPage } from './pages/items/RollsPage';
import { AppShell } from './components/Layout/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/items/fabrics" element={<FabricsPage />} />
                <Route path="/items/colors" element={<ColorsPage />} />
                <Route path="/items/prices" element={<PricesPage />} />
                <Route path="/items/rolls" element={<RollsPage />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck -w frontend`
Expected: no errors (page files don't exist yet, so import errors are expected — fix by creating placeholder files or skip this step until pages are done)

---

## Task 19: items-api.ts — React Query hooks

**Files:**
- Create: `frontend/src/lib/items-api.ts`

- [ ] **Step 1: Write items-api.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// ---- Types (mirrors backend items.types.ts) ----

export type Fabric = {
  id: number;
  code: string;
  name_ar: string;
  composition: Array<{ material: string; percent: number }>;
  width_cm: string;
  grade: string;
  notes: string | null;
  is_active: boolean;
};

export type Color = {
  id: number;
  name_ar: string;
  code: string;
  is_active: boolean;
};

export type FabricColorPrice = {
  id: number;
  fabric_id: number;
  color_id: number;
  default_price_per_kg: string;
  default_price_per_roll: string | null;
};

export type RollStatus =
  | 'in_stock' | 'reserved' | 'sold' | 'damaged'
  | 'sample' | 'returned' | 'written_off';

export type RollWarehouse = 'shop' | 'factory' | 'damaged_shop';

export type Roll = {
  id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  color_id: number;
  roll_sr_no: string | null;
  order_no: string | null;
  weight_kg: string;
  purchase_price_egp: string | null;
  selling_price_egp: string;
  status: RollStatus;
  warehouse: RollWarehouse;
  is_visible_at_pos: boolean;
  received_at: string | null;
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
};

// ---- Input types ----

export type CreateFabricInput = {
  code: string;
  name_ar: string;
  composition: Array<{ material: string; percent: number }>;
  width_cm: number;
  grade: string;
  notes?: string | null;
};

export type UpdateFabricInput = Partial<CreateFabricInput & { is_active: boolean }>;

export type CreateColorInput = { name_ar: string; code: string };
export type UpdateColorInput = Partial<CreateColorInput & { is_active: boolean }>;

export type UpsertPriceInput = {
  fabric_id: number;
  color_id: number;
  default_price_per_kg: number;
  default_price_per_roll?: number | null;
};

export type CreateRollInput = {
  fabric_id: number;
  color_id: number;
  weight_kg: number;
  warehouse: RollWarehouse;
  roll_sr_no?: string | null;
  order_no?: string | null;
  external_barcode?: string | null;
  purchase_price_egp?: number | null;
  selling_price_egp?: number;
  is_visible_at_pos?: boolean;
};

export type RollFilters = {
  fabric_id?: number;
  color_id?: number;
  status?: RollStatus;
  warehouse?: RollWarehouse;
  is_visible_at_pos?: boolean;
};

// ---- Fabrics hooks ----

export function useFabrics() {
  return useQuery<Fabric[]>({
    queryKey: ['fabrics'],
    queryFn: () => api.get<Fabric[]>('/fabrics').then((r) => r.data),
  });
}

export function useCreateFabric() {
  const qc = useQueryClient();
  return useMutation<Fabric, Error, CreateFabricInput>({
    mutationFn: (data) => api.post<Fabric>('/fabrics', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabrics'] }),
  });
}

export function useUpdateFabric() {
  const qc = useQueryClient();
  return useMutation<Fabric, Error, { id: number; data: UpdateFabricInput }>({
    mutationFn: ({ id, data }) => api.patch<Fabric>(`/fabrics/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabrics'] }),
  });
}

// ---- Colors hooks ----

export function useColors() {
  return useQuery<Color[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<Color[]>('/colors').then((r) => r.data),
  });
}

export function useCreateColor() {
  const qc = useQueryClient();
  return useMutation<Color, Error, CreateColorInput>({
    mutationFn: (data) => api.post<Color>('/colors', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['colors'] }),
  });
}

export function useUpdateColor() {
  const qc = useQueryClient();
  return useMutation<Color, Error, { id: number; data: UpdateColorInput }>({
    mutationFn: ({ id, data }) => api.patch<Color>(`/colors/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['colors'] }),
  });
}

// ---- Prices hooks ----

export function usePrices() {
  return useQuery<FabricColorPrice[]>({
    queryKey: ['prices'],
    queryFn: () => api.get<FabricColorPrice[]>('/fabric-color-prices').then((r) => r.data),
  });
}

export function useUpsertPrice() {
  const qc = useQueryClient();
  return useMutation<FabricColorPrice, Error, UpsertPriceInput>({
    mutationFn: (data) =>
      api.post<FabricColorPrice>('/fabric-color-prices', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prices'] }),
  });
}

// ---- Rolls hooks ----

export function useRolls(filters: RollFilters = {}) {
  return useQuery<Roll[]>({
    queryKey: ['rolls', filters],
    queryFn: () =>
      api.get<Roll[]>('/rolls', { params: filters }).then((r) => r.data),
  });
}

export function useCreateRoll() {
  const qc = useQueryClient();
  return useMutation<Roll, Error, CreateRollInput>({
    mutationFn: (data) => api.post<Roll>('/rolls', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rolls'] }),
  });
}

export function useUpdateRoll() {
  const qc = useQueryClient();
  return useMutation<Roll, Error, { id: number; data: Partial<CreateRollInput> }>({
    mutationFn: ({ id, data }) => api.patch<Roll>(`/rolls/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rolls'] }),
  });
}

export function useTogglePosVisibility() {
  const qc = useQueryClient();
  return useMutation<Roll, Error, number>({
    mutationFn: (id) =>
      api.post<Roll>(`/rolls/${id}/toggle-pos-visibility`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rolls'] }),
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w frontend`
Expected: no errors in items-api.ts (page import errors may still exist until pages are written)

---

## Task 20: FabricsPage

**Files:**
- Create: `frontend/src/pages/items/FabricsPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import {
  useFabrics,
  useCreateFabric,
  useUpdateFabric,
  type Fabric,
  type CreateFabricInput,
} from '@/lib/items-api';

const FabricFormSchema = z.object({
  code: z.string().min(1).max(32),
  name_ar: z.string().min(1).max(128),
  composition: z
    .array(z.object({ material: z.string().min(1), percent: z.number().min(0).max(100) }))
    .min(1),
  width_cm: z.number().positive(),
  grade: z.string().min(1).max(16),
  notes: z.string().nullable().optional(),
});
type FabricFormData = z.infer<typeof FabricFormSchema>;

function FabricModal({
  open,
  fabric,
  onClose,
}: {
  open: boolean;
  fabric?: Fabric;
  onClose: () => void;
}) {
  const createMutation = useCreateFabric();
  const updateMutation = useUpdateFabric();
  const isEditing = Boolean(fabric);

  const form = useForm<FabricFormData>({
    resolver: zodResolver(FabricFormSchema),
    defaultValues: fabric
      ? {
          code: fabric.code,
          name_ar: fabric.name_ar,
          composition: fabric.composition,
          width_cm: Number(fabric.width_cm),
          grade: fabric.grade,
          notes: fabric.notes,
        }
      : {
          code: '',
          name_ar: '',
          composition: [{ material: '', percent: 100 }],
          width_cm: 0,
          grade: '',
          notes: null,
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'composition',
  });

  async function onSubmit(values: FabricFormData) {
    if (isEditing && fabric) {
      await updateMutation.mutateAsync({ id: fabric.id, data: values });
    } else {
      await createMutation.mutateAsync(values as CreateFabricInput);
    }
    onClose();
    form.reset();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? ar.items.fabrics.edit : ar.items.fabrics.add}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar.items.fabrics.code}</Label>
              <Input {...form.register('code')} />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>{ar.items.fabrics.name}</Label>
              <Input {...form.register('name_ar')} />
            </div>
            <div className="space-y-1">
              <Label>{ar.items.fabrics.grade}</Label>
              <Input {...form.register('grade')} />
            </div>
            <div className="space-y-1">
              <Label>{ar.items.fabrics.width}</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register('width_cm', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{ar.items.fabrics.composition}</Label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-center">
                <Input
                  placeholder={ar.items.fabrics.material}
                  className="flex-1"
                  {...form.register(`composition.${index}.material`)}
                />
                <Input
                  type="number"
                  placeholder="%"
                  className="w-20"
                  {...form.register(`composition.${index}.percent`, { valueAsNumber: true })}
                />
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ material: '', percent: 0 })}
            >
              <Plus className="h-4 w-4 ml-1" />
              {ar.items.fabrics.addMaterial}
            </Button>
          </div>

          <div className="space-y-1">
            <Label>{ar.items.fabrics.notes}</Label>
            <Input {...form.register('notes')} />
          </div>

          <div className="flex gap-2 justify-start">
            <Button type="submit" disabled={isPending}>
              {isPending ? ar.items.loading : ar.items.save}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {ar.items.cancel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FabricsPage() {
  const { user } = useAuth();
  const { data: fabrics, isLoading } = useFabrics();
  const [modalOpen, setModalOpen] = useState(false);
  const [editFabric, setEditFabric] = useState<Fabric | undefined>();

  const isOwner = user?.role === 'owner';

  function openCreate() {
    setEditFabric(undefined);
    setModalOpen(true);
  }

  function openEdit(fabric: Fabric) {
    setEditFabric(fabric);
    setModalOpen(true);
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ar.items.fabrics.title}</h1>
        {isOwner && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 ml-1" />
            {ar.items.fabrics.add}
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">{ar.items.loading}</p>}

      {!isLoading && fabrics && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-right font-medium">{ar.items.fabrics.code}</th>
                <th className="p-3 text-right font-medium">{ar.items.fabrics.name}</th>
                <th className="p-3 text-right font-medium">{ar.items.fabrics.grade}</th>
                <th className="p-3 text-right font-medium">{ar.items.fabrics.width}</th>
                <th className="p-3 text-right font-medium">{ar.items.fabrics.composition}</th>
                <th className="p-3 text-right font-medium">الحالة</th>
                {isOwner && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {fabrics.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    {ar.items.notFound}
                  </td>
                </tr>
              )}
              {fabrics.map((f) => (
                <tr key={f.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono">{f.code}</td>
                  <td className="p-3">{f.name_ar}</td>
                  <td className="p-3">{f.grade}</td>
                  <td className="p-3">{f.width_cm}</td>
                  <td className="p-3 text-xs">
                    {f.composition.map((c) => `${c.material} ${c.percent}%`).join(' + ')}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        f.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {f.is_active ? ar.items.active : ar.items.inactive}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(f)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FabricModal
        open={modalOpen}
        fabric={editFabric}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w frontend`
Expected: no errors

---

## Task 21: ColorsPage

**Files:**
- Create: `frontend/src/pages/items/ColorsPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import { useColors, useCreateColor, useUpdateColor, type Color } from '@/lib/items-api';

const ColorFormSchema = z.object({
  name_ar: z.string().min(1).max(64),
  code: z.string().min(1).max(16),
});
type ColorFormData = z.infer<typeof ColorFormSchema>;

function ColorModal({
  open,
  color,
  onClose,
}: {
  open: boolean;
  color?: Color;
  onClose: () => void;
}) {
  const createMutation = useCreateColor();
  const updateMutation = useUpdateColor();
  const isEditing = Boolean(color);

  const form = useForm<ColorFormData>({
    resolver: zodResolver(ColorFormSchema),
    defaultValues: color
      ? { name_ar: color.name_ar, code: color.code }
      : { name_ar: '', code: '' },
  });

  async function onSubmit(values: ColorFormData) {
    if (isEditing && color) {
      await updateMutation.mutateAsync({ id: color.id, data: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    onClose();
    form.reset();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? ar.items.colors.edit : ar.items.colors.add}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>{ar.items.colors.name}</Label>
            <Input {...form.register('name_ar')} />
            {form.formState.errors.name_ar && (
              <p className="text-xs text-destructive">{form.formState.errors.name_ar.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{ar.items.colors.code}</Label>
            <Input {...form.register('code')} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? ar.items.loading : ar.items.save}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {ar.items.cancel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ColorsPage() {
  const { user } = useAuth();
  const { data: colors, isLoading } = useColors();
  const [modalOpen, setModalOpen] = useState(false);
  const [editColor, setEditColor] = useState<Color | undefined>();
  const isOwner = user?.role === 'owner';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ar.items.colors.title}</h1>
        {isOwner && (
          <Button onClick={() => { setEditColor(undefined); setModalOpen(true); }}>
            <Plus className="h-4 w-4 ml-1" />
            {ar.items.colors.add}
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">{ar.items.loading}</p>}

      {!isLoading && colors && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-right font-medium">{ar.items.colors.name}</th>
                <th className="p-3 text-right font-medium">{ar.items.colors.code}</th>
                <th className="p-3 text-right font-medium">الحالة</th>
                {isOwner && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {colors.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    {ar.items.notFound}
                  </td>
                </tr>
              )}
              {colors.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">{c.name_ar}</td>
                  <td className="p-3 font-mono">{c.code}</td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {c.is_active ? ar.items.active : ar.items.inactive}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditColor(c); setModalOpen(true); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ColorModal
        open={modalOpen}
        color={editColor}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w frontend`
Expected: no errors

---

## Task 22: PricesPage (pivot grid)

**Files:**
- Create: `frontend/src/pages/items/PricesPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState, useRef } from 'react';
import { ar } from '@/i18n/ar';
import { useFabrics, useColors, usePrices, useUpsertPrice } from '@/lib/items-api';
import { useAuth } from '@/lib/auth';

type CellKey = `${number}-${number}`;

export function PricesPage() {
  const { user } = useAuth();
  const { data: fabrics, isLoading: loadingFabrics } = useFabrics();
  const { data: colors, isLoading: loadingColors } = useColors();
  const { data: prices, isLoading: loadingPrices } = usePrices();
  const upsertMutation = useUpsertPrice();
  const isOwner = user?.role === 'owner';

  const [editingCell, setEditingCell] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savedCell, setSavedCell] = useState<CellKey | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = loadingFabrics || loadingColors || loadingPrices;

  // Build a lookup map fabricId-colorId → price
  const priceMap = new Map<CellKey, string>();
  prices?.forEach((p) => {
    priceMap.set(`${p.fabric_id}-${p.color_id}`, p.default_price_per_kg);
  });

  function startEdit(fabricId: number, colorId: number) {
    if (!isOwner) return;
    const key: CellKey = `${fabricId}-${colorId}`;
    const current = priceMap.get(key) ?? '';
    setEditingCell(key);
    setEditValue(current);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit(fabricId: number, colorId: number) {
    const key: CellKey = `${fabricId}-${colorId}`;
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed > 0) {
      await upsertMutation.mutateAsync({
        fabric_id: fabricId,
        color_id: colorId,
        default_price_per_kg: parsed,
      });
      setSavedCell(key);
      setTimeout(() => setSavedCell(null), 2000);
    }
    setEditingCell(null);
  }

  const activeFabrics = fabrics?.filter((f) => f.is_active) ?? [];
  const activeColors = colors?.filter((c) => c.is_active) ?? [];

  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-xl font-bold">{ar.items.prices.title}</h1>

      {isLoading && <p className="text-muted-foreground">{ar.items.loading}</p>}

      {!isLoading && (
        <div className="overflow-x-auto border rounded-md">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-3 text-right font-medium border border-border min-w-[160px]">
                  خامة \ لون
                </th>
                {activeColors.map((c) => (
                  <th key={c.id} className="p-3 text-center font-medium border border-border min-w-[100px]">
                    <div>{c.name_ar}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.code}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeFabrics.length === 0 && (
                <tr>
                  <td colSpan={activeColors.length + 1} className="p-4 text-center text-muted-foreground">
                    {ar.items.notFound}
                  </td>
                </tr>
              )}
              {activeFabrics.map((f) => (
                <tr key={f.id} className="hover:bg-muted/20">
                  <td className="p-3 border border-border font-medium">
                    <div>{f.name_ar}</div>
                    <div className="text-xs text-muted-foreground font-mono">{f.code}</div>
                  </td>
                  {activeColors.map((c) => {
                    const key: CellKey = `${f.id}-${c.id}`;
                    const isEditing = editingCell === key;
                    const isSaved = savedCell === key;
                    const price = priceMap.get(key);

                    return (
                      <td
                        key={c.id}
                        className={`p-2 border border-border text-center cursor-pointer select-none
                          ${isOwner ? 'hover:bg-primary/10' : ''}
                          ${isSaved ? 'bg-green-50' : ''}
                        `}
                        onClick={() => !isEditing && startEdit(f.id, c.id)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(f.id, c.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(f.id, c.id);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-20 text-center border-b border-primary outline-none bg-transparent"
                            autoFocus
                          />
                        ) : (
                          <span className={price ? 'font-medium' : 'text-muted-foreground'}>
                            {price ? Number(price).toFixed(2) : ar.items.prices.noPrice}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isOwner && (
        <p className="text-xs text-muted-foreground">
          انقر على خلية لتعديل السعر. اضغط Enter للحفظ أو Escape للإلغاء.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w frontend`
Expected: no errors

---

## Task 23: RollsPage

**Files:**
- Create: `frontend/src/pages/items/RollsPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import {
  useFabrics,
  useColors,
  usePrices,
  useRolls,
  useCreateRoll,
  useTogglePosVisibility,
  type Roll,
  type RollStatus,
  type RollWarehouse,
  type CreateRollInput,
} from '@/lib/items-api';

const STATUSES: RollStatus[] = [
  'in_stock', 'reserved', 'sold', 'damaged', 'sample', 'returned', 'written_off',
];
const WAREHOUSES: RollWarehouse[] = ['shop', 'factory', 'damaged_shop'];

const CreateRollFormSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  weight_kg: z.number().positive(),
  warehouse: z.enum(['shop', 'factory', 'damaged_shop']),
  roll_sr_no: z.string().max(32).optional(),
  order_no: z.string().max(32).optional(),
  external_barcode: z.string().max(64).optional(),
  purchase_price_egp: z.number().positive().optional(),
  selling_price_egp: z.number().positive().optional(),
  is_visible_at_pos: z.boolean().optional(),
});
type CreateRollFormData = z.infer<typeof CreateRollFormSchema>;

function CreateRollModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: fabrics } = useFabrics();
  const { data: colors } = useColors();
  const { data: prices } = usePrices();
  const createMutation = useCreateRoll();

  const form = useForm<CreateRollFormData>({
    resolver: zodResolver(CreateRollFormSchema),
    defaultValues: {
      fabric_id: undefined,
      color_id: undefined,
      weight_kg: undefined,
      warehouse: 'shop',
      is_visible_at_pos: true,
    },
  });

  const watchFabricId = form.watch('fabric_id');
  const watchColorId = form.watch('color_id');

  // Auto-fill price when fabric+color selected
  function handleFabricOrColorChange() {
    const fabricId = form.getValues('fabric_id');
    const colorId = form.getValues('color_id');
    if (fabricId && colorId && prices) {
      const priceRow = prices.find(
        (p) => p.fabric_id === fabricId && p.color_id === colorId,
      );
      if (priceRow) {
        form.setValue('selling_price_egp', Number(priceRow.default_price_per_kg));
      }
    }
  }

  async function onSubmit(values: CreateRollFormData) {
    const input: CreateRollInput = {
      ...values,
      fabric_id: Number(values.fabric_id),
      color_id: Number(values.color_id),
      roll_sr_no: values.roll_sr_no || null,
      order_no: values.order_no || null,
      external_barcode: values.external_barcode || null,
      purchase_price_egp: values.purchase_price_egp ?? null,
    };
    await createMutation.mutateAsync(input);
    onClose();
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{ar.items.rolls.add}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar.items.rolls.fabric}</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                {...form.register('fabric_id', {
                  valueAsNumber: true,
                  onChange: handleFabricOrColorChange,
                })}
              >
                <option value="">{ar.items.rolls.allFabrics}</option>
                {fabrics?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.name_ar}
                  </option>
                ))}
              </select>
              {form.formState.errors.fabric_id && (
                <p className="text-xs text-destructive">مطلوب</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.color}</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                {...form.register('color_id', {
                  valueAsNumber: true,
                  onChange: handleFabricOrColorChange,
                })}
              >
                <option value="">{ar.items.rolls.allColors}</option>
                {colors?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_ar} ({c.code})
                  </option>
                ))}
              </select>
              {form.formState.errors.color_id && (
                <p className="text-xs text-destructive">مطلوب</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.weight}</Label>
              <Input
                type="number"
                step="0.001"
                {...form.register('weight_kg', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.sellingPrice}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={ar.items.rolls.autoPrice}
                {...form.register('selling_price_egp', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.purchasePrice}</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register('purchase_price_egp', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.warehouse}</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                {...form.register('warehouse')}
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {ar.items.rolls.warehouses[w]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.rollSrNo}</Label>
              <Input {...form.register('roll_sr_no')} />
            </div>

            <div className="space-y-1">
              <Label>{ar.items.rolls.orderNo}</Label>
              <Input {...form.register('order_no')} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{ar.items.rolls.externalBarcode}</Label>
            <Input {...form.register('external_barcode')} />
          </div>

          {createMutation.error && (
            <p className="text-sm text-destructive">{ar.items.error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? ar.items.loading : ar.items.save}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {ar.items.cancel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RollDetailDialog({ roll, onClose }: { roll: Roll; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{roll.internal_barcode}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {[
            [ar.items.rolls.fabric, `${roll.fabric_name_ar} (${roll.fabric_code})`],
            [ar.items.rolls.color, `${roll.color_name_ar} (${roll.color_code})`],
            [ar.items.rolls.weight, `${roll.weight_kg} كج`],
            [ar.items.rolls.sellingPrice, `${Number(roll.selling_price_egp).toFixed(2)} ج.م.`],
            [ar.items.rolls.purchasePrice, roll.purchase_price_egp ? `${Number(roll.purchase_price_egp).toFixed(2)} ج.م.` : '—'],
            [ar.items.rolls.status, ar.items.rolls.statuses[roll.status]],
            [ar.items.rolls.warehouse, ar.items.rolls.warehouses[roll.warehouse]],
            [ar.items.rolls.rollSrNo, roll.roll_sr_no ?? '—'],
            [ar.items.rolls.orderNo, roll.order_no ?? '—'],
            [ar.items.rolls.externalBarcode, roll.external_barcode ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-muted-foreground w-36 shrink-0">{label}:</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RollsPage() {
  const { user } = useAuth();
  const { data: fabrics } = useFabrics();
  const { data: colors } = useColors();
  const isOwner = user?.role === 'owner';

  const [filterFabric, setFilterFabric] = useState<number | undefined>();
  const [filterColor, setFilterColor] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<RollStatus | undefined>();
  const [filterWarehouse, setFilterWarehouse] = useState<RollWarehouse | undefined>();

  const { data: rolls, isLoading } = useRolls({
    fabric_id: filterFabric,
    color_id: filterColor,
    status: filterStatus,
    warehouse: filterWarehouse,
  });

  const toggleVisibility = useTogglePosVisibility();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRoll, setDetailRoll] = useState<Roll | undefined>();

  const selectClass = 'border rounded-md px-3 py-2 text-sm w-full';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ar.items.rolls.title}</h1>
        {isOwner && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 ml-1" />
            {ar.items.rolls.add}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <select
          className={selectClass}
          value={filterFabric ?? ''}
          onChange={(e) => setFilterFabric(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">{ar.items.rolls.allFabrics}</option>
          {fabrics?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.code} — {f.name_ar}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filterColor ?? ''}
          onChange={(e) => setFilterColor(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">{ar.items.rolls.allColors}</option>
          {colors?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_ar} ({c.code})
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filterStatus ?? ''}
          onChange={(e) => setFilterStatus((e.target.value || undefined) as RollStatus | undefined)}
        >
          <option value="">{ar.items.rolls.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {ar.items.rolls.statuses[s]}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filterWarehouse ?? ''}
          onChange={(e) =>
            setFilterWarehouse((e.target.value || undefined) as RollWarehouse | undefined)
          }
        >
          <option value="">{ar.items.rolls.allWarehouses}</option>
          {WAREHOUSES.map((w) => (
            <option key={w} value={w}>
              {ar.items.rolls.warehouses[w]}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground">{ar.items.loading}</p>}

      {!isLoading && rolls && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-right font-medium">{ar.items.rolls.internalBarcode}</th>
                <th className="p-3 text-right font-medium">{ar.items.rolls.fabric}</th>
                <th className="p-3 text-right font-medium">{ar.items.rolls.color}</th>
                <th className="p-3 text-right font-medium">{ar.items.rolls.weight}</th>
                <th className="p-3 text-right font-medium">{ar.items.rolls.sellingPrice}</th>
                <th className="p-3 text-right font-medium">{ar.items.rolls.status}</th>
                <th className="p-3 text-right font-medium">{ar.items.rolls.warehouse}</th>
                <th className="p-3 text-center font-medium">{ar.items.rolls.posVisibility}</th>
              </tr>
            </thead>
            <tbody>
              {rolls.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">
                    {ar.items.notFound}
                  </td>
                </tr>
              )}
              {rolls.map((r) => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetailRoll(r)}
                >
                  <td className="p-3 font-mono text-xs">{r.internal_barcode}</td>
                  <td className="p-3">{r.fabric_name_ar}</td>
                  <td className="p-3">{r.color_name_ar}</td>
                  <td className="p-3">{r.weight_kg} كج</td>
                  <td className="p-3">{Number(r.selling_price_egp).toFixed(2)}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                      {ar.items.rolls.statuses[r.status]}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{ar.items.rolls.warehouses[r.warehouse]}</td>
                  <td
                    className="p-3 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isOwner ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={toggleVisibility.isPending}
                        onClick={() => toggleVisibility.mutate(r.id)}
                      >
                        {r.is_visible_at_pos ? (
                          <Eye className="h-4 w-4 text-green-600" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    ) : (
                      r.is_visible_at_pos ? (
                        <Eye className="h-4 w-4 text-green-600 mx-auto" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground mx-auto" />
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <CreateRollModal open onClose={() => setCreateOpen(false)} />}
      {detailRoll && <RollDetailDialog roll={detailRoll} onClose={() => setDetailRoll(undefined)} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w frontend`
Expected: no errors

---

## Task 24: Final build, typecheck, and commit

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```
Expected: 0 errors in both backend + frontend.

- [ ] **Step 2: Full build**

```bash
npm run build
```
Expected: exits 0; `backend/public/` contains built frontend assets.

- [ ] **Step 3: Migrations apply + rollback + re-apply + seed**

```bash
npm run db:migrate:rollback
npm run db:migrate
npm run db:seed
```
Expected: all exit 0.

- [ ] **Step 4: Run tests**

```bash
npm run test -w backend
```
Expected: 4 auth-guard tests PASS; 2 DB tests SKIPPED.

- [ ] **Step 5: Commit everything and push**

```bash
git add -A
git commit -m "feat(phase-1): items & catalog — fabrics, colors, prices, rolls"
git push origin main
```

---

## Self-Review Checklist

- [x] **Migrations 005-008**: fabrics → colors → fabric_color_prices → rolls (correct dependency order, ENUMs + sequence in 008, all have `down()` that reverses `up()`)
- [x] **Seed 002**: idempotent check, production guard, returns ids via `.returning('id')`
- [x] **Types**: `items.types.ts` defines all DB row shapes; frontend types in `items-api.ts` are consistent copies
- [x] **Schemas**: `CreateFabricSchema`, `UpdateFabricSchema`, `CreateColorSchema`, `UpdateColorSchema`, `UpsertPriceSchema`, `CreateRollSchema`, `UpdateRollSchema`, `ListRollsQuerySchema` — all referenced in controllers
- [x] **Services**: `generateBarcode()` uses `roll_barcode_seq`; `createRoll` throws `NO_DEFAULT_PRICE` caught in controller; `updateRoll` locks price+weight when status=`sold`; `findByBarcode` matches both internal + external columns
- [x] **Routes**: `/rolls/by-barcode/:barcode` registered BEFORE `/rolls/:id` to prevent Express routing conflict; all writes gated on `requireRole('owner')` for Phase 1
- [x] **Audit log**: called in `createFabric`, `updateFabric`, `createColor`, `updateColor`, `upsertPrice`, `createRoll`, `updateRoll`, `togglePosVisibility`
- [x] **api/routes.ts**: `itemsRouter` mounted at `/` (not `/items`) so endpoints are `/api/fabrics`, `/api/rolls`, etc.
- [x] **TopBar**: الأصناف dropdown with 4 sub-items pointing to `/items/*`
- [x] **App.tsx**: 4 routes added inside the ProtectedRoute shell
- [x] **i18n**: all page strings in `ar.items.*`; existing keys untouched
- [x] **Frontend**: all pages RTL (`dir="rtl"`), Arabic labels from `ar.*`, owner-only actions hidden for non-owners
- [x] **Pivot grid**: inline edit on click, auto-save on blur/Enter, Escape to cancel, saved flash indicator
- [x] **Roll create**: auto-fills `selling_price_egp` from prices data when fabric+color selected
- [x] **POS visibility toggle**: eye icon, stops row click propagation, disabled during pending state
