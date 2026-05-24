import { api } from './api';

export type HrEmployee = {
  id: number;
  name_ar: string;
  phone: string | null;
  role_ar: string | null;
  base_salary_egp: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HrEmployeeDetail = HrEmployee & {
  last_disbursements: HrSalaryDisbursement[];
};

export type HrSalaryDisbursement = {
  id: number;
  employee_id: number;
  month: string;
  gross_egp: string;
  adjustments_egp: string;
  net_egp: string;
  paid_via: 'cash' | 'instapay' | 'bank_transfer';
  bank_account_id: number | null;
  notes_ar: string | null;
  actor_user_id: number;
  created_at: string;
  employee_name_ar?: string;
  actor_username?: string | null;
  bank_name_ar?: string | null;
};

export type HrSalaryAdjustment = {
  id: number;
  employee_id: number;
  kind: 'advance' | 'deduction';
  amount_egp: string;
  salary_month: string;
  reason_ar: string | null;
  actor_user_id: number;
  created_at: string;
  employee_name_ar?: string;
  actor_username?: string | null;
};

export type HrSalaryPreview = {
  employee_id: number;
  name_ar: string;
  base_salary_egp: number;
  adjustments_egp: number;
  net_egp: number;
  already_disbursed: boolean;
  disbursement_id: number | null;
};

export const hrApi = {
  listEmployees: (params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: HrEmployee[]; total: number }> =>
    api.get('/hr/employees', { params }).then((r) => r.data),

  getEmployee: (id: number): Promise<HrEmployeeDetail> =>
    api.get(`/hr/employees/${id}`).then((r) => r.data),

  createEmployee: (data: {
    name_ar: string;
    phone?: string | null;
    role_ar?: string | null;
    base_salary_egp: number;
  }): Promise<HrEmployee> =>
    api.post('/hr/employees', data).then((r) => r.data),

  updateEmployee: (id: number, data: {
    name_ar?: string;
    phone?: string | null;
    role_ar?: string | null;
    base_salary_egp?: number;
    is_active?: boolean;
  }): Promise<HrEmployee> =>
    api.patch(`/hr/employees/${id}`, data).then((r) => r.data),

  listDisbursements: (params?: {
    employee_id?: number;
    month_from?: string;
    month_to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: HrSalaryDisbursement[]; total: number }> =>
    api.get('/hr/salaries', { params }).then((r) => r.data),

  getMonthPreview: (month: string): Promise<HrSalaryPreview[]> =>
    api.get('/hr/salaries/preview', { params: { month } }).then((r) => r.data),

  disburse: (data: {
    employee_id: number;
    month: string;
    paid_via: 'cash' | 'instapay' | 'bank_transfer';
    bank_account_id?: number | null;
    notes_ar?: string | null;
  }): Promise<HrSalaryDisbursement> =>
    api.post('/hr/salaries', data).then((r) => r.data),

  listAdjustments: (params?: {
    employee_id?: number;
    kind?: 'advance' | 'deduction';
    salary_month?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: HrSalaryAdjustment[]; total: number }> =>
    api.get('/hr/adjustments', { params }).then((r) => r.data),

  createAdjustment: (data: {
    employee_id: number;
    kind: 'advance' | 'deduction';
    amount_egp: number;
    salary_month: string;
    reason_ar?: string | null;
  }): Promise<HrSalaryAdjustment> =>
    api.post('/hr/adjustments', data).then((r) => r.data),
};
