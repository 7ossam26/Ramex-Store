import { db } from '../../db/connection.js';
import { ENTITY_CONFIG, VALID_ENTITIES, type CodeEntityName, type CodeRow, type RollReference } from './codes.types.js';
import type {
  CreateGradeInput, UpdateGradeInput,
  CreateColorCodeInput, UpdateColorCodeInput,
  CreateCompositionInput, UpdateCompositionInput,
  CreateBrandInput, UpdateBrandInput,
  CreateSupplierInput, UpdateSupplierInput,
} from './codes.schemas.js';

type CreateInput =
  | CreateGradeInput
  | CreateColorCodeInput
  | CreateCompositionInput
  | CreateBrandInput
  | CreateSupplierInput;

type UpdateInput =
  | UpdateGradeInput
  | UpdateColorCodeInput
  | UpdateCompositionInput
  | UpdateBrandInput
  | UpdateSupplierInput;

export function isValidEntity(e: string): e is CodeEntityName {
  return (VALID_ENTITIES as string[]).includes(e);
}

export async function listCodes(
  entity: CodeEntityName,
  activeFilter: 'true' | 'false' | 'all',
): Promise<Array<CodeRow & { usage_count: number }>> {
  const { table, rollsFkCol } = ENTITY_CONFIG[entity];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any;
  if (rollsFkCol) {
    q = db(table)
      .select(`${table}.*`)
      .select(
        db.raw(
          `(SELECT COUNT(*)::int FROM rolls WHERE rolls.${rollsFkCol} = ${table}.id AND rolls.status != 'written_off') AS usage_count`,
        ),
      )
      .orderBy(`${table}.id`, 'desc');
  } else {
    q = db(table)
      .select(`${table}.*`, db.raw('0::int AS usage_count'))
      .orderBy('id', 'desc');
  }

  if (activeFilter === 'true')  q.where(`${table}.is_active`, true);
  if (activeFilter === 'false') q.where(`${table}.is_active`, false);

  const rows: Array<Record<string, unknown>> = await q;

  if (entity === 'compositions') {
    return rows.map((r) => ({
      ...r,
      breakdown: r.breakdown ? JSON.parse(r.breakdown as string) : null,
      usage_count: Number(r.usage_count),
    })) as unknown as Array<CodeRow & { usage_count: number }>;
  }
  return rows.map((r) => ({ ...r, usage_count: Number(r.usage_count) })) as unknown as Array<CodeRow & { usage_count: number }>;
}

export async function listRollReferences(
  entity: CodeEntityName,
  id: number,
): Promise<RollReference[]> {
  const { rollsFkCol } = ENTITY_CONFIG[entity];
  if (!rollsFkCol) return [];

  return db('rolls')
    .select(
      'rolls.id',
      'rolls.internal_barcode',
      'rolls.status',
      db.raw("COALESCE(fabrics.name_ar, '—') AS fabric_name"),
      db.raw("COALESCE(colors.name_ar, '—') AS color_name"),
    )
    .leftJoin('fabrics', 'rolls.fabric_id', 'fabrics.id')
    .leftJoin('colors', 'rolls.color_id', 'colors.id')
    .where(`rolls.${rollsFkCol}`, id)
    .whereNotIn('rolls.status', ['written_off'])
    .orderBy('rolls.id', 'desc')
    .limit(200);
}

export async function getCode(entity: CodeEntityName, id: number): Promise<CodeRow | undefined> {
  const { table } = ENTITY_CONFIG[entity];
  const row = await db(table).where({ id }).first();
  if (!row) return undefined;
  if (entity === 'compositions' && row.breakdown) {
    row.breakdown = JSON.parse(row.breakdown);
  }
  return row as CodeRow;
}

export async function createCode(
  entity: CodeEntityName,
  data: CreateInput,
  createdByUserId: number,
): Promise<CodeRow> {
  const { table } = ENTITY_CONFIG[entity];
  const payload: Record<string, unknown> = { ...data, created_by_user_id: createdByUserId };
  if (entity === 'compositions' && (data as CreateCompositionInput).breakdown != null) {
    payload.breakdown = JSON.stringify((data as CreateCompositionInput).breakdown);
  }
  const [id] = await db(table).insert(payload);
  return getCode(entity, id as number) as Promise<CodeRow>;
}

export async function updateCode(
  entity: CodeEntityName,
  id: number,
  data: UpdateInput,
): Promise<CodeRow | undefined> {
  const { table } = ENTITY_CONFIG[entity];
  const patch: Record<string, unknown> = { ...data, updated_at: db.fn.now() };
  if (entity === 'compositions' && (data as UpdateCompositionInput).breakdown !== undefined) {
    patch.breakdown = JSON.stringify((data as UpdateCompositionInput).breakdown);
  }
  await db(table).where({ id }).update(patch);
  return getCode(entity, id);
}

export async function isReferencedByActiveRoll(
  entity: CodeEntityName,
  id: number,
): Promise<boolean> {
  const { rollsFkCol } = ENTITY_CONFIG[entity];
  if (!rollsFkCol) return false;

  const refRoll = await db('rolls')
    .where(rollsFkCol, id)
    .whereNotIn('status', ['written_off'])
    .first();
  return !!refRoll;
}

export async function softDeleteCode(
  entity: CodeEntityName,
  id: number,
): Promise<void> {
  const { table } = ENTITY_CONFIG[entity];
  await db(table).where({ id }).update({ is_active: false, updated_at: db.fn.now() });
}

export async function restoreCode(
  entity: CodeEntityName,
  id: number,
): Promise<CodeRow | undefined> {
  const { table } = ENTITY_CONFIG[entity];
  await db(table).where({ id }).update({ is_active: true, updated_at: db.fn.now() });
  return getCode(entity, id);
}
