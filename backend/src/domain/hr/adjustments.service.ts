import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';
import * as repo from './adjustments.repository.js';
import type { HrSalaryAdjustment } from './hr.types.js';
import type { CreateAdjustmentInput } from './hr.schemas.js';

export async function listAdjustments(params: {
  employeeId?: number;
  kind?: 'advance' | 'deduction';
  salaryMonth?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: HrSalaryAdjustment[]; total: number }> {
  return repo.listAdjustments({ ...params, page: params.page ?? 1, limit: params.limit ?? 50 });
}

export async function createAdjustment(
  data: CreateAdjustmentInput,
  actorUserId: number,
): Promise<HrSalaryAdjustment> {
  const adj = await repo.createAdjustment(data, actorUserId);
  await auditFromService(db, {
    actorUserId,
    action: 'hr_adjustment_created',
    entity: 'hr_adjustment',
    entityId: adj.id,
    after: {
      employee_id: data.employee_id,
      kind: data.kind,
      amount_egp: data.amount_egp,
      salary_month: data.salary_month,
    },
    severity: 'medium',
  });
  return adj;
}
