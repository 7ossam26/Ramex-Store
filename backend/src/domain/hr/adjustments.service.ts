import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';
import { recordMovement as cashRecordMovement } from '../finance/cashDrawerService.js';
import { recordMovement as bankRecordMovement } from '../finance/bankService.js';
import * as repo from './adjustments.repository.js';
import * as employeesRepo from './employees.repository.js';
import type { HrSalaryAdjustment, HrAdvanceRepayment } from './hr.types.js';
import type { CreateAdjustmentInput, RepayAdvanceInput } from './hr.schemas.js';

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
      // Advances pay out cash now — refuse if the drawer can't cover it.
      const drawer = await trx('cash_drawer').where({ id: 1 }).forUpdate().first();
      if (!drawer || Number(drawer.current_balance_egp) < data.amount_egp) {
        throw new Error('INSUFFICIENT_CASH_BALANCE');
      }

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

/**
 * Record a standalone advance repayment (employee returns money outside payroll).
 * Cash repayments are a cash inflow; bank repayments credit the chosen account.
 */
export async function repayAdvance(
  employeeId: number,
  data: RepayAdvanceInput,
  actorUserId: number,
): Promise<HrAdvanceRepayment> {
  const employee = await employeesRepo.getEmployee(employeeId);
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  const outstanding = await repo.getOutstandingAdvanceBalance(employeeId);
  if (data.amount_egp > outstanding) {
    throw new Error('ADVANCE_REPAYMENT_EXCEEDS_OUTSTANDING');
  }

  return db.transaction(async (trx) => {
    const repayment = await repo.insertStandaloneAdvanceRepayment(trx, {
      employee_id: employeeId,
      amount_egp: data.amount_egp,
      paid_via: data.paid_via,
      bank_account_id: data.paid_via !== 'cash' ? (data.bank_account_id ?? null) : null,
      notes_ar: data.notes_ar ?? null,
      actor_user_id: actorUserId,
    });

    if (data.paid_via === 'cash') {
      await cashRecordMovement(
        trx, 'in', 'advance_repayment', data.amount_egp, actorUserId,
        'hr_advance_repayment', repayment.id,
        `سداد سلفة: ${employee.name_ar}`,
      );
    } else if (data.bank_account_id) {
      await bankRecordMovement(
        trx, data.bank_account_id, 'in', 'other_in', data.amount_egp, actorUserId,
        'hr_advance_repayment', repayment.id,
        `سداد سلفة: ${employee.name_ar}`,
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'hr_advance_repaid',
      entity: 'hr_advance_repayment',
      entityId: repayment.id,
      after: {
        employee_id: employeeId,
        amount_egp: data.amount_egp,
        paid_via: data.paid_via,
        bank_account_id: data.bank_account_id ?? null,
      },
      severity: 'high',
    });

    return repayment;
  });
}
