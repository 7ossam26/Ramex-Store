import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';
import * as repo from './employees.repository.js';
import type { HrEmployee } from './hr.types.js';
import type { CreateEmployeeInput, UpdateEmployeeInput } from './hr.schemas.js';

export async function listEmployees(params: {
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: HrEmployee[]; total: number }> {
  return repo.listEmployees({ ...params, page: params.page ?? 1, limit: params.limit ?? 50 });
}

export async function getEmployee(id: number): Promise<HrEmployee> {
  const emp = await repo.getEmployee(id);
  if (!emp) throw new Error('EMPLOYEE_NOT_FOUND');
  return emp;
}

export async function createEmployee(data: CreateEmployeeInput, actorUserId: number): Promise<HrEmployee> {
  const emp = await repo.createEmployee(data);
  await auditFromService(db, {
    actorUserId,
    action: 'hr_employee_created',
    entity: 'hr_employee',
    entityId: emp.id,
    after: { name_ar: emp.name_ar, base_salary_egp: emp.base_salary_egp },
    severity: 'medium',
  });
  return emp;
}

export async function updateEmployee(
  id: number,
  data: UpdateEmployeeInput,
  actorUserId: number,
): Promise<HrEmployee> {
  const before = await getEmployee(id);
  const updated = await repo.updateEmployee(id, data);
  await auditFromService(db, {
    actorUserId,
    action: 'hr_employee_updated',
    entity: 'hr_employee',
    entityId: id,
    before: { name_ar: before.name_ar, base_salary_egp: before.base_salary_egp, is_active: before.is_active },
    after: { name_ar: updated.name_ar, base_salary_egp: updated.base_salary_egp, is_active: updated.is_active },
    severity: 'medium',
  });
  return updated;
}
