import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as lotsCtl from './lots.controller.js';

export const lotsRouter = Router();

lotsRouter.use(requireAuth, requireActiveSession);

lotsRouter.get('/lots', requirePermission('fabric_rolls', 'read'), lotsCtl.listLots);
lotsRouter.get('/lots/:id', requirePermission('fabric_rolls', 'read'), lotsCtl.getLot);
lotsRouter.post('/lots', requirePermission('fabric_rolls', 'write'), lotsCtl.createLot);
lotsRouter.patch('/lots/:id', requirePermission('fabric_rolls', 'write'), lotsCtl.updateLot);
