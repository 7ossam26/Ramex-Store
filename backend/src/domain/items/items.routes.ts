import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as fabricsCtl from './fabrics.controller.js';
import * as colorsCtl from './colors.controller.js';
import * as pricesCtl from './prices.controller.js';
import * as rollsCtl from './rolls.controller.js';
import * as topsCtl from './tops.controller.js';

export const itemsRouter = Router();

itemsRouter.use(requireAuth, requireActiveSession);

// Fabrics — read is open to all authenticated users (reference data for forms).
// Write operations are super_admin only (system configuration; Phase 5: map to items.write).
itemsRouter.get('/fabrics', requirePermission('fabric_rolls', 'read'), fabricsCtl.listFabrics);
itemsRouter.post('/fabrics', requireRole('super_admin'), fabricsCtl.createFabric);
itemsRouter.patch('/fabrics/:id', requireRole('super_admin'), fabricsCtl.updateFabric);

// Colors — same pattern as fabrics.
itemsRouter.get('/colors', requirePermission('fabric_rolls', 'read'), colorsCtl.listColors);
itemsRouter.post('/colors', requireRole('super_admin'), colorsCtl.createColor);
itemsRouter.patch('/colors/:id', requireRole('super_admin'), colorsCtl.updateColor);

// Prices — read needed by POS (shop_seller has fabric_rolls.read=true).
itemsRouter.get('/fabric-color-prices', requirePermission('fabric_rolls', 'read'), pricesCtl.listPrices);
itemsRouter.post('/fabric-color-prices', requireRole('super_admin'), pricesCtl.upsertPrice);

// Tops batch — factory entry wizard: factory_sender and owner via fabric_rolls.write.
itemsRouter.post('/tops/batch', requirePermission('fabric_rolls', 'write'), topsCtl.createTopBatch);

// Rolls — static paths must come before /:id to avoid conflicts.
itemsRouter.get('/rolls/by-barcode/:barcode', requirePermission('fabric_rolls', 'read'), rollsCtl.findByBarcode);
itemsRouter.get('/rolls/search', requirePermission('fabric_rolls', 'read'), rollsCtl.searchRolls);
itemsRouter.post('/rolls/labels-batch', requirePermission('fabric_rolls', 'read'), rollsCtl.getBatchLabelsPdf);
itemsRouter.post('/rolls/fabric-labels/batch', requirePermission('fabric_rolls', 'read'), rollsCtl.getBatchFabricLabels);
itemsRouter.get('/rolls', requirePermission('fabric_rolls', 'read'), rollsCtl.listRolls);
// NOTE: POST /rolls was removed — أتواب may only be created through the
// /tops/batch wizard (factory entry) or the factory shipment flow.
itemsRouter.get('/rolls/:id', requirePermission('fabric_rolls', 'read'), rollsCtl.getRollDetail);
itemsRouter.get('/rolls/:id/fabric-label', requirePermission('fabric_rolls', 'read'), rollsCtl.getFabricLabel);
itemsRouter.get('/rolls/:id/label-pdf', requirePermission('fabric_rolls', 'read'), rollsCtl.getLabelPdf);
itemsRouter.post('/rolls/:id/reprint-label', requirePermission('fabric_rolls', 'read'), rollsCtl.reprintLabel);
itemsRouter.patch('/rolls/:id', requirePermission('inventory', 'write'), rollsCtl.updateRoll);
itemsRouter.post('/rolls/:id/toggle-pos-visibility', requirePermission('inventory', 'write'), rollsCtl.togglePosVisibility);
itemsRouter.post('/rolls/:id/return-to-factory', requirePermission('inventory', 'write'), rollsCtl.returnToFactory);
