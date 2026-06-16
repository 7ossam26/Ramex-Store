import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { can } from '../permissions/permissionsService.js';
import * as ctl from './codes.controller.js';

export const codesRouter = Router();

codesRouter.use(requireAuth, requireActiveSession);

// Code entities map onto matrix resources: suppliers → 'suppliers'; the fabric
// code tables (grades/colors/compositions/brands) are inventory master data →
// 'inventory'. Reads stay open to any authenticated user (dropdowns rely on them);
// mutations require the 'write' action. super_admin is short-circuited inside can().
const ENTITY_RESOURCE: Record<string, string> = {
  suppliers:    'suppliers',
  grades:       'inventory',
  colors:       'inventory',
  compositions: 'inventory',
  brands:       'inventory',
};

const requireCodePermission = (action: string): RequestHandler =>
  async (req, res, next) => {
    try {
      const resource = ENTITY_RESOURCE[req.params['entity'] as string];
      if (!resource) { res.status(404).json({ error: 'unknown_entity' }); return; }
      const user = req.user!;
      if (!(await can(user.role, resource, action, user.sub))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: 'internal' });
    }
  };

codesRouter.get('/:entity',                    ctl.listEntities);
codesRouter.post('/:entity',                   requireCodePermission('write'), ctl.createEntity);
codesRouter.get('/:entity/:id/references',     ctl.listEntityReferences);
codesRouter.patch('/:entity/:id',              requireCodePermission('write'), ctl.updateEntity);
codesRouter.delete('/:entity/:id',             requireCodePermission('write'), ctl.softDeleteEntity);
codesRouter.post('/:entity/:id/restore',       requireCodePermission('write'), ctl.restoreEntity);
