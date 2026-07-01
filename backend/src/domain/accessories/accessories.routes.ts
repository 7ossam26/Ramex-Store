import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as ctl from './accessories.controller.js';

export const accessoriesRouter = Router();

accessoriesRouter.use(requireAuth, requireActiveSession);

// Barcode lookup — static path first to avoid /:id conflict
accessoriesRouter.get(
  '/accessories/by-barcode/:barcode',
  requirePermission('accessories', 'read'),
  ctl.getAccessoryByBarcode,
);

// Name search for POS grid
accessoriesRouter.get(
  '/accessories/search',
  requirePermission('accessories', 'read'),
  ctl.searchAccessories,
);

// Label PDF
accessoriesRouter.get(
  '/accessories/:id/label',
  requirePermission('accessories', 'read'),
  ctl.getAccessoryLabel,
);

// Create
accessoriesRouter.post(
  '/accessories',
  requirePermission('accessories', 'write'),
  ctl.createAccessory,
);

// List (with optional filters)
accessoriesRouter.get(
  '/accessories',
  requirePermission('accessories', 'read'),
  ctl.listAccessories,
);

// Get one
accessoriesRouter.get(
  '/accessories/:id',
  requirePermission('accessories', 'read'),
  ctl.getAccessory,
);

// Update (name/notes/cost only — qty moves via sales)
accessoriesRouter.patch(
  '/accessories/:id',
  requirePermission('accessories', 'write'),
  ctl.updateAccessory,
);
