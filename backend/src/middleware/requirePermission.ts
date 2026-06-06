import type { RequestHandler } from 'express';
import { can } from '../domain/permissions/permissionsService.js';

/** Matrix-driven permission gate. Replaces hard-coded requireRole() on routes
 *  where the permission key (resource+action) is defined in role_permissions.
 *  super_admin is unconditionally allowed (short-circuited in can()).
 *  Per-user overrides are respected. */
export const requirePermission = (resource: string, action: string): RequestHandler =>
  async (req, res, next) => {
    try {
      const user = req.user!;
      const allowed = await can(user.role, resource, action, user.sub);
      if (!allowed) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: 'internal' });
    }
  };
