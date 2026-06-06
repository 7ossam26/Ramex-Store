import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as ctl from './shifts.controller.js';

export const shiftsRouter = Router();

shiftsRouter.use(requireAuth, requireActiveSession);

shiftsRouter.get('/current', requirePermission('cash_drawer', 'read'), ctl.getCurrentShift);
shiftsRouter.post('/open', requirePermission('cash_drawer', 'write'), ctl.openShift);
shiftsRouter.post('/close', requirePermission('cash_drawer', 'write'), ctl.closeShift);
shiftsRouter.get('/', requirePermission('cash_drawer', 'read'), ctl.listShifts);
shiftsRouter.get('/:id/report', requirePermission('cash_drawer', 'read'), ctl.getShiftReport);
shiftsRouter.get('/:id/export', requirePermission('cash_drawer', 'read'), ctl.exportShiftReport);
