import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';
import { recordMovement as cashRecordMovement } from '../finance/cashDrawerService.js';
import * as repo from './adjustments.repository.js';
import * as employeesRepo from './employees.repository.js';
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
  if (data.kind === 'advance') {
    // Advances are real cash outflows — record against cash drawer in same transaction
    const employee = await employeesRepo.getEmployee(data.employee_id);
    if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

    return db.transaction(async (trx) => {
      const adj = await repo.createAdjustment(trx, data, actorUserId);

      await cashRecordMovement(
        trx, 'out', 'expense', data.amount_egp, actorUserId,
        'hr_adjustment', adj.id,
        `سُلفة: ${employee.name_ar}`,
      );

      await auditFromService(trx, {
        actorUserId,
        action: 'hr_advance_created',
        entity: 'hr_adjustment',
        entityId: adj.id,
        after: {
          employee_id: data.employee_id,
          kind: data.kind,
          amount_egp: data.amount_egp,
          salary_month: data.salary_month,
        },
        severity: 'high',
      });

      return adj;
    });
  }

  // Deductions: no cash movement, just record and audit
  const adj = await repo.createAdjustment(db, data, actorUserId);
  await auditFromService(db, {
    actorUserId,
    action: 'hr_deduction_created',
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

export async function getOutstandingAdvanceBalance(employeeId: number): Promise<number> {
  return repo.getOutstandingAdvanceBalance(employeeId);
}
