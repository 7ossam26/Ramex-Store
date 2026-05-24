import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as ctl from './codes.controller.js';

export const codesRouter = Router();

codesRouter.use(requireAuth, requireActiveSession);

codesRouter.get('/:entity',                    ctl.listEntities);
codesRouter.post('/:entity',                   requireRole('owner', 'super_admin'), ctl.createEntity);
codesRouter.get('/:entity/:id/references',     ctl.listEntityReferences);
codesRouter.patch('/:entity/:id',              requireRole('owner', 'super_admin'), ctl.updateEntity);
codesRouter.delete('/:entity/:id',             requireRole('owner', 'super_admin'), ctl.softDeleteEntity);
codesRouter.post('/:entity/:id/restore',       requireRole('owner', 'super_admin'), ctl.restoreEntity);
