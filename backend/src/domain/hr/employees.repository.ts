import { db } from '../../db/connection.js';
import type { HrEmployee } from './hr.types.js';
import type { CreateEmployeeInput, UpdateEmployeeInput } from './hr.schemas.js';

export async function listEmployees(params: {
  isActive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<{ rows: HrEmployee[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('hr_employees');

  if (params.isActive !== undefined) base.where('is_active', params.isActive);
  if (params.search) {
    const q = `%${params.search}%`;
    base.where((b) => b.whereLike('name_ar', q).orWhereLike('phone', q));
  }

  const [countRow] = await base.clone().count<Array<{ count: string }>>('id as count');
  const rows = await base
    .clone()
    .select('*')
    .orderBy('name_ar', 'asc')
    .limit(params.limit)
    .offset(offset);

  return { rows: rows as HrEmployee[], total: Number((countRow as { count: string }).count) };
}

export async function getEmployee(id: number): Promise<HrEmployee | undefined> {
  return db('hr_employees').where({ id }).first() as Promise<HrEmployee | undefined>;
}

export async function createEmployee(data: CreateEmployeeInput): Promise<HrEmployee> {
  const [{ id }] = await db('hr_employees').insert({
    name_ar: data.name_ar,
    phone: data.phone ?? null,
    role_ar: data.role_ar ?? null,
    base_salary_egp: data.base_salary_egp,
  }).returning('id');
  return db('hr_employees').where({ id }).first() as Promise<HrEmployee>;
}

export async function updateEmployee(id: number, data: UpdateEmployeeInput): Promise<HrEmployee> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name_ar !== undefined) patch['name_ar'] = data.name_ar;
  if ('phone' in data) patch['phone'] = data.phone ?? null;
  if ('role_ar' in data) patch['role_ar'] = data.role_ar ?? null;
  if (data.base_salary_egp !== undefined) patch['base_salary_egp'] = data.base_salary_egp;
  if (data.is_active !== undefined) patch['is_active'] = data.is_active;

  await db('hr_employees').where({ id }).update(patch);
  return db('hr_employees').where({ id }).first() as Promise<HrEmployee>;
}
