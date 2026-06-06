import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import type { HrSalaryAdjustment, HrAdvanceRepayment } from './hr.types.js';
import type { CreateAdjustmentInput } from './hr.schemas.js';

export async function listAdjustments(params: {
  employeeId?: number;
  kind?: 'advance' | 'deduction';
  salaryMonth?: string;
  page: number;
  limit: number;
}): Promise<{ rows: HrSalaryAdjustment[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('hr_salary_adjustments as a')
    .leftJoin('hr_employees as e', 'a.employee_id', 'e.id')
    .leftJoin('users as u', 'a.actor_user_id', 'u.id')
    .select('a.*', 'e.name_ar as employee_name_ar', 'u.username as actor_username');

  if (params.employeeId) base.where('a.employee_id', params.employeeId);
  if (params.kind) base.where('a.kind', params.kind);
  if (params.salaryMonth) base.where('a.salary_month', params.salaryMonth);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('a.id as count');
  const rows = await base.clone().orderBy('a.created_at', 'desc').limit(params.limit).offset(offset);

  return { rows: rows as HrSalaryAdjustment[], total: Number((countRow as { count: string }).count) };
}

export async function sumDeductionsForMonth(employeeId: number, salaryMonth: string): Promise<number> {
  const [{ total }] = await db('hr_salary_adjustments')
    .where({ employee_id: employeeId, salary_month: salaryMonth, kind: 'deduction' })
    .sum<Array<{ total: string | null }>>('amount_egp as total');
  return Number(total ?? 0);
}

/** @deprecated use sumDeductionsForMonth + outstanding balance instead */
export async function sumAdjustmentsForMonth(employeeId: number, salaryMonth: string): Promise<number> {
  const [{ total }] = await db('hr_salary_adjustments')
    .where({ employee_id: employeeId, salary_month: salaryMonth })
    .sum<Array<{ total: string | null }>>('amount_egp as total');
  return Number(total ?? 0);
}

export async function getOutstandingAdvanceBalance(employeeId: number): Promise<number> {
  const [{ total_advances }] = await db('hr_salary_adjustments')
    .where({ employee_id: employeeId, kind: 'advance' })
    .sum<Array<{ total_advances: string | null }>>('amount_egp as total_advances');

  const [{ total_repaid }] = await db('hr_advance_repayments')
    .where({ employee_id: employeeId })
    .sum<Array<{ total_repaid: string | null }>>('amount_egp as total_repaid');

  return Math.max(0, Number(total_advances ?? 0) - Number(total_repaid ?? 0));
}

export async function insertAdvanceRepayment(
  trx: Knex.Transaction,
  data: {
    employee_id: number;
    disbursement_id: number;
    amount_egp: number;
    actor_user_id: number;
  },
): Promise<HrAdvanceRepayment> {
  const [{ id }] = await trx('hr_advance_repayments').insert(data).returning('id');
  return trx('hr_advance_repayments').where({ id }).first() as Promise<HrAdvanceRepayment>;
}

export async function createAdjustment(
  trxOrDb: Knex | Knex.Transaction,
  data: CreateAdjustmentInput,
  actorUserId: number,
): Promise<HrSalaryAdjustment> {
  const [{ id }] = await trxOrDb('hr_salary_adjustments').insert({
    employee_id: data.employee_id,
    kind: data.kind,
    amount_egp: data.amount_egp,
    salary_month: data.salary_month,
    reason_ar: data.reason_ar ?? null,
    actor_user_id: actorUserId,
  }).returning('id');

  return trxOrDb('hr_salary_adjustments as a')
    .leftJoin('hr_employees as e', 'a.employee_id', 'e.id')
    .leftJoin('users as u', 'a.actor_user_id', 'u.id')
    .select('a.*', 'e.name_ar as employee_name_ar', 'u.username as actor_username')
    .where('a.id', id)
    .first() as Promise<HrSalaryAdjustment>;
}
