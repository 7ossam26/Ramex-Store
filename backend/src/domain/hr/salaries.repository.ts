import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import type { HrSalaryDisbursement, HrSalaryPreview } from './hr.types.js';

export async function listDisbursements(params: {
  employeeId?: number;
  monthFrom?: string;
  monthTo?: string;
  page: number;
  limit: number;
}): Promise<{ rows: HrSalaryDisbursement[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('hr_salary_disbursements as d')
    .leftJoin('hr_employees as e', 'd.employee_id', 'e.id')
    .leftJoin('users as u', 'd.actor_user_id', 'u.id')
    .leftJoin('bank_accounts as b', 'd.bank_account_id', 'b.id')
    .select('d.*', 'e.name_ar as employee_name_ar', 'u.username as actor_username', 'b.name_ar as bank_name_ar');

  if (params.employeeId) base.where('d.employee_id', params.employeeId);
  if (params.monthFrom) base.where('d.month', '>=', params.monthFrom);
  if (params.monthTo) base.where('d.month', '<=', params.monthTo);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('d.id as count');
  const rows = await base.clone().orderBy('d.month', 'desc').orderBy('d.created_at', 'desc').limit(params.limit).offset(offset);

  return { rows: rows as HrSalaryDisbursement[], total: Number((countRow as { count: string }).count) };
}

export async function getDisbursement(id: number): Promise<HrSalaryDisbursement | undefined> {
  return db('hr_salary_disbursements as d')
    .leftJoin('hr_employees as e', 'd.employee_id', 'e.id')
    .leftJoin('users as u', 'd.actor_user_id', 'u.id')
    .leftJoin('bank_accounts as b', 'd.bank_account_id', 'b.id')
    .select('d.*', 'e.name_ar as employee_name_ar', 'u.username as actor_username', 'b.name_ar as bank_name_ar')
    .where('d.id', id)
    .first() as Promise<HrSalaryDisbursement | undefined>;
}

export async function getSalaryPreviewForMonth(
  salaryMonth: string,
): Promise<HrSalaryPreview[]> {
  const employees = await db('hr_employees').where({ is_active: true }).select('id', 'name_ar', 'base_salary_egp');

  const adjustmentSums = await db('hr_salary_adjustments')
    .where('salary_month', salaryMonth)
    .groupBy('employee_id')
    .select('employee_id')
    .sum('amount_egp as total');

  const disbursed = await db('hr_salary_disbursements')
    .where('month', salaryMonth)
    .select('employee_id', 'id as disbursement_id');

  const adjMap = new Map<number, number>(
    adjustmentSums.map((r) => [Number(r.employee_id), Number(r.total ?? 0)]),
  );
  const disburseMap = new Map<number, number>(
    disbursed.map((r) => [Number(r.employee_id), Number(r.disbursement_id)]),
  );

  return employees.map((e) => {
    const base = Number(e.base_salary_egp);
    const adj = adjMap.get(e.id) ?? 0;
    const disbId = disburseMap.has(e.id) ? disburseMap.get(e.id)! : null;
    return {
      employee_id: e.id,
      name_ar: e.name_ar,
      base_salary_egp: base,
      adjustments_egp: adj,
      net_egp: base - adj,
      already_disbursed: disbId !== null,
      disbursement_id: disbId,
    };
  });
}

export async function insertDisbursement(
  trx: Knex.Transaction,
  data: {
    employee_id: number;
    month: string;
    gross_egp: number;
    adjustments_egp: number;
    net_egp: number;
    paid_via: 'cash' | 'instapay' | 'bank_transfer';
    bank_account_id: number | null;
    notes_ar: string | null;
    actor_user_id: number;
  },
): Promise<HrSalaryDisbursement> {
  const [{ id }] = await trx('hr_salary_disbursements').insert(data).returning('id');
  return trx('hr_salary_disbursements as d')
    .leftJoin('hr_employees as e', 'd.employee_id', 'e.id')
    .leftJoin('users as u', 'd.actor_user_id', 'u.id')
    .leftJoin('bank_accounts as b', 'd.bank_account_id', 'b.id')
    .select('d.*', 'e.name_ar as employee_name_ar', 'u.username as actor_username', 'b.name_ar as bank_name_ar')
    .where('d.id', id)
    .first() as Promise<HrSalaryDisbursement>;
}
