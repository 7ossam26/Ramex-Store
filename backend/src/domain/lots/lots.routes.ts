import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as lotsCtl from './lots.controller.js';

export const lotsRouter = Router();

lotsRouter.use(requireAuth, requireActiveSession);

// Lots are created from the Add Top wizard (Ahmed) or by Owner during setup.
// Read endpoints open to any authenticated user (inventory grid uses them).
lotsRouter.get('/lots', lotsCtl.listLots);
lotsRouter.get('/lots/:id', lotsCtl.getLot);
lotsRouter.post('/lots', requireRole('owner', 'factory_sender'), lotsCtl.createLot);
lotsRouter.patch('/lots/:id', requireRole('owner', 'factory_sender'), lotsCtl.updateLot);
