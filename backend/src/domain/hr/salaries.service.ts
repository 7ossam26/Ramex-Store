import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { recordMovement as cashRecordMovement } from '../finance/cashDrawerService.js';
import { recordMovement as bankRecordMovement } from '../finance/bankService.js';
import * as salariesRepo from './salaries.repository.js';
import * as adjustmentsRepo from './adjustments.repository.js';
import * as employeesRepo from './employees.repository.js';
import type { HrSalaryDisbursement, HrSalaryPreview } from './hr.types.js';
import type { DisburseInput } from './hr.schemas.js';

export async function listDisbursements(params: {
  employeeId?: number;
  monthFrom?: string;
  monthTo?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: HrSalaryDisbursement[]; total: number }> {
  return salariesRepo.listDisbursements({ ...params, page: params.page ?? 1, limit: params.limit ?? 50 });
}

export async function getDisbursement(id: number): Promise<HrSalaryDisbursement> {
  const d = await salariesRepo.getDisbursement(id);
  if (!d) throw new Error('DISBURSEMENT_NOT_FOUND');
  return d;
}

export async function getMonthPreview(salaryMonth: string): Promise<HrSalaryPreview[]> {
  return salariesRepo.getSalaryPreviewForMonth(salaryMonth);
}

export async function disburse(data: DisburseInput, actorUserId: number): Promise<HrSalaryDisbursement> {
  const employee = await employeesRepo.getEmployee(data.employee_id);
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
  if (!employee.is_active) throw new Error('EMPLOYEE_NOT_ACTIVE');

  const grossEgp = Number(employee.base_salary_egp);
  const deductionsEgp = await adjustmentsRepo.sumDeductionsForMonth(data.employee_id, data.month);
  const advanceRepaymentEgp = data.advance_repayment_egp ?? 0;

  // Validate advance repayment does not exceed outstanding balance
  if (advanceRepaymentEgp > 0) {
    const outstanding = await adjustmentsRepo.getOutstandingAdvanceBalance(data.employee_id);
    if (advanceRepaymentEgp > outstanding) {
      throw new Error('ADVANCE_REPAYMENT_EXCEEDS_OUTSTANDING');
    }
  }

  const netEgp = grossEgp - deductionsEgp - advanceRepaymentEgp;

  return db.transaction(async (trx) => {
    let disbursement: HrSalaryDisbursement;
    try {
      disbursement = await salariesRepo.insertDisbursement(trx, {
        employee_id: data.employee_id,
        month: data.month,
        gross_egp: grossEgp,
        adjustments_egp: deductionsEgp,
        advance_repayment_egp: advanceRepaymentEgp,
        net_egp: netEgp,
        paid_via: data.paid_via,
        bank_account_id: data.bank_account_id ?? null,
        notes_ar: data.notes_ar ?? null,
        actor_user_id: actorUserId,
      });
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === '23505') throw new Error('SALARY_ALREADY_DISBURSED');
      throw err;
    }

    // Record advance repayment ledger entry
    if (advanceRepaymentEgp > 0) {
      await adjustmentsRepo.insertAdvanceRepayment(trx, {
        employee_id: data.employee_id,
        disbursement_id: disbursement.id,
        amount_egp: advanceRepaymentEgp,
        actor_user_id: actorUserId,
      });
    }

    // Cash/bank outflow for the net salary paid
    if (data.paid_via === 'cash') {
      await cashRecordMovement(
        trx, 'out', 'expense', netEgp, actorUserId,
        'hr_salary_disbursement', disbursement.id,
        `راتب: ${employee.name_ar}`,
      );
    } else if (data.bank_account_id) {
      await bankRecordMovement(
        trx, data.bank_account_id, 'out', 'other_out', netEgp, actorUserId,
        'hr_salary_disbursement', disbursement.id,
        `راتب: ${employee.name_ar}`,
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'hr_salary_disbursed',
      entity: 'hr_salary_disbursement',
      entityId: disbursement.id,
      after: {
        employee_id: data.employee_id,
        month: data.month,
        gross_egp: grossEgp,
        deductions_egp: deductionsEgp,
        advance_repayment_egp: advanceRepaymentEgp,
        net_egp: netEgp,
        paid_via: data.paid_via,
      },
      severity: 'high',
    });

    return disbursement;
  });
}
