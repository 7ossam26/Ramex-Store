import { db } from '../../db/connection.js';
import { ENTITY_CONFIG, VALID_ENTITIES, type CodeEntityName, type CodeRow } from './codes.types.js';
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
): Promise<CodeRow[]> {
  const { table } = ENTITY_CONFIG[entity];
  const q = db(table).orderBy('id', 'desc');
  if (activeFilter === 'true')  q.where('is_active', true);
  if (activeFilter === 'false') q.where('is_active', false);
  const rows = await q;
  if (entity === 'compositions') {
    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      breakdown: r.breakdown ? JSON.parse(r.breakdown as string) : null,
    })) as CodeRow[];
  }
  return rows as CodeRow[];
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
