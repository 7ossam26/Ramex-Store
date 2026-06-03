import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as ctl from './shifts.controller.js';

export const shiftsRouter = Router();

shiftsRouter.use(requireAuth, requireActiveSession);

// Current open shift (null if none)
shiftsRouter.get('/current', ctl.getCurrentShift);

// Open a new shift (seller or owner)
shiftsRouter.post('/open', requireRole('owner', 'shop_seller', 'super_admin'), ctl.openShift);

// Close the current shift (seller or owner)
shiftsRouter.post('/close', requireRole('owner', 'shop_seller', 'super_admin'), ctl.closeShift);

// List past shifts (owner or seller with read access)
shiftsRouter.get('/', ctl.listShifts);

// Get report for a specific shift
shiftsRouter.get('/:id/report', ctl.getShiftReport);

// Export report for a specific shift (?format=pdf|excel|print)
shiftsRouter.get('/:id/export', ctl.exportShiftReport);
