import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { can } from '../permissions/permissionsService.js';
import * as employeesSvc from './employees.service.js';
import * as salariesSvc from './salaries.service.js';
import * as adjustmentsSvc from './adjustments.service.js';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  DisburseSchema,
  CreateAdjustmentSchema,
} from './hr.schemas.js';

export const hrRouter = Router();
hrRouter.use(requireAuth, requireActiveSession);

function requireHrPerm(action: string): RequestHandler {
  return async (req, res, next) => {
    const role = req.user!.role;
    if (role === 'owner') return next();
    const allowed = await can(role, 'hr', action);
    if (!allowed) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}

// ─── Employees ────────────────────────────────────────────────────────────────

hrRouter.get('/employees', requireHrPerm('view'), async (req, res, next) => {
  try {
    const isActive = req.query['is_active'] === undefined
      ? undefined
      : req.query['is_active'] === 'true';
    const result = await employeesSvc.listEmployees({
      isActive,
      search: req.query['search'] as string | undefined,
      page: Number(req.query['page'] ?? 1),
      limit: Number(req.query['limit'] ?? 50),
    });
    res.json(result);
  } catch (e) { next(e); }
});

hrRouter.post('/employees', requireHrPerm('manage'), async (req, res, next) => {
  try {
    const data = CreateEmployeeSchema.parse(req.body);
    const emp = await employeesSvc.createEmployee(data, req.user!.sub);
    res.status(201).json(emp);
  } catch (e) { next(e); }
});

hrRouter.get('/employees/:id', requireHrPerm('view'), async (req, res, next) => {
  try {
    const emp = await employeesSvc.getEmployee(Number(req.params['id']));
    const lastSalaries = await salariesSvc.listDisbursements({
      employeeId: emp.id,
      limit: 12,
    });
    res.json({ ...emp, last_disbursements: lastSalaries.rows });
  } catch (e) { next(e); }
});

hrRouter.patch('/employees/:id', requireHrPerm('manage'), async (req, res, next) => {
  try {
    const data = UpdateEmployeeSchema.parse(req.body);
    const emp = await employeesSvc.updateEmployee(Number(req.params['id']), data, req.user!.sub);
    res.json(emp);
  } catch (e) { next(e); }
});

// ─── Salaries ─────────────────────────────────────────────────────────────────

hrRouter.get('/salaries', requireHrPerm('view'), async (req, res, next) => {
  try {
    const result = await salariesSvc.listDisbursements({
      employeeId: req.query['employee_id'] ? Number(req.query['employee_id']) : undefined,
      monthFrom: req.query['month_from'] as string | undefined,
      monthTo: req.query['month_to'] as string | undefined,
      page: Number(req.query['page'] ?? 1),
      limit: Number(req.query['limit'] ?? 50),
    });
    res.json(result);
  } catch (e) { next(e); }
});

hrRouter.get('/salaries/preview', requireHrPerm('view'), async (req, res, next) => {
  try {
    const month = req.query['month'] as string;
    if (!month) { res.status(400).json({ error: 'month required' }); return; }
    const preview = await salariesSvc.getMonthPreview(month);
    res.json(preview);
  } catch (e) { next(e); }
});

hrRouter.get('/salaries/:id', requireHrPerm('view'), async (req, res, next) => {
  try {
    const d = await salariesSvc.getDisbursement(Number(req.params['id']));
    res.json(d);
  } catch (e) { next(e); }
});

hrRouter.post('/salaries', requireHrPerm('salary.disburse'), async (req, res, next) => {
  try {
    const data = DisburseSchema.parse(req.body);
    const d = await salariesSvc.disburse(data, req.user!.sub);
    res.status(201).json(d);
  } catch (e) {
    if (e instanceof Error && e.message === 'SALARY_ALREADY_DISBURSED') {
      res.status(409).json({ error: 'SALARY_ALREADY_DISBURSED' });
      return;
    }
    if (e instanceof Error && e.message === 'EMPLOYEE_NOT_FOUND') {
      res.status(404).json({ error: 'EMPLOYEE_NOT_FOUND' });
      return;
    }
    next(e);
  }
});

// ─── Adjustments ──────────────────────────────────────────────────────────────

hrRouter.get('/adjustments', requireHrPerm('view'), async (req, res, next) => {
  try {
    const kind = req.query['kind'] as 'advance' | 'deduction' | undefined;
    const result = await adjustmentsSvc.listAdjustments({
      employeeId: req.query['employee_id'] ? Number(req.query['employee_id']) : undefined,
      kind: kind || undefined,
      salaryMonth: req.query['salary_month'] as string | undefined,
      page: Number(req.query['page'] ?? 1),
      limit: Number(req.query['limit'] ?? 50),
    });
    res.json(result);
  } catch (e) { next(e); }
});

hrRouter.post('/adjustments', async (req, res, next) => {
  try {
    const body = CreateAdjustmentSchema.parse(req.body);
    const neededAction = body.kind === 'advance' ? 'advance.create' : 'deduction.create';
    const role = req.user!.role;
    if (role !== 'owner') {
      const allowed = await can(role, 'hr', neededAction);
      if (!allowed) { res.status(403).json({ error: 'forbidden' }); return; }
    }
    const adj = await adjustmentsSvc.createAdjustment(body, req.user!.sub);
    res.status(201).json(adj);
  } catch (e) { next(e); }
});
