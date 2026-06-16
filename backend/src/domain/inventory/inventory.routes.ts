import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as shipmentsCtl from './shipments.controller.js';
import * as damageCtl from './damage.controller.js';
import * as stocktakeCtl from './stocktake.controller.js';
import * as adjustmentsCtl from './adjustments.controller.js';
import * as stockMovementsCtl from './stockMovements.controller.js';
import * as stockSummaryCtl from './stockSummary.controller.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth, requireActiveSession);

// --- Shipments ---
inventoryRouter.post('/shipments', requirePermission('shipments', 'write'), shipmentsCtl.createDraft);
inventoryRouter.post('/shipments/:id/rolls', requirePermission('shipments', 'write'), shipmentsCtl.addRoll);
inventoryRouter.delete('/shipments/:id/lines/:lineId', requirePermission('shipments', 'write'), shipmentsCtl.removeLine);
inventoryRouter.delete('/shipments/:id', requirePermission('shipments', 'write'), shipmentsCtl.deleteDraft);
inventoryRouter.post('/shipments/:id/submit', requirePermission('shipments', 'write'), shipmentsCtl.submit);

// Review + accept require shipments.approve (shop_seller has approve=true; factory_sender has approve=false via HARD_DENY).
inventoryRouter.post('/shipments/:id/lines/:lineId/review', requirePermission('shipments', 'approve'), shipmentsCtl.reviewLine);
inventoryRouter.post('/shipments/:id/accept', requirePermission('shipments', 'approve'), shipmentsCtl.acceptShipment);

// Picker for Ahmed: أتواب in factory not yet assigned to an active shipment line.
inventoryRouter.get('/shipments/factory-rolls', requirePermission('shipments', 'read'), shipmentsCtl.listFactoryRolls);

inventoryRouter.get('/shipments', requirePermission('shipments', 'read'), shipmentsCtl.listShipments);
inventoryRouter.get('/shipments/:id', requirePermission('shipments', 'read'), shipmentsCtl.getShipment);

// --- Damage Events ---
inventoryRouter.post('/damage-events', requirePermission('inventory', 'write'), damageCtl.createDamageEvent);
inventoryRouter.post('/damage-events/:id/approve', requirePermission('inventory', 'approve'), damageCtl.approveOrReject);
inventoryRouter.get('/damage-events', requirePermission('inventory', 'read'), damageCtl.listDamageEvents);
inventoryRouter.get('/damage-events/:id', requirePermission('inventory', 'read'), damageCtl.getDamageEvent);

// --- Stocktakes ---
inventoryRouter.post('/stocktakes', requirePermission('inventory', 'write'), stocktakeCtl.start);
inventoryRouter.post('/stocktakes/:id/scan', requirePermission('inventory', 'write'), stocktakeCtl.scan);
inventoryRouter.post('/stocktakes/:id/aggregate', requirePermission('inventory', 'write'), stocktakeCtl.aggregate);
inventoryRouter.post('/stocktakes/:id/complete', requirePermission('inventory', 'write'), stocktakeCtl.complete);
inventoryRouter.get('/stocktakes', requirePermission('inventory', 'read'), stocktakeCtl.list);
inventoryRouter.get('/stocktakes/:id', requirePermission('inventory', 'read'), stocktakeCtl.get);

// --- Adjustments ---
inventoryRouter.post('/adjustments', requirePermission('inventory', 'write'), adjustmentsCtl.createAdjustment);
inventoryRouter.get('/adjustments', requirePermission('inventory', 'read'), adjustmentsCtl.listAdjustments);

// --- Stock Movements (read-only ledger) ---
inventoryRouter.get('/stock-movements', requirePermission('inventory', 'read'), stockMovementsCtl.listStockMovements);

// --- Stock Summary (inventory landing) ---
inventoryRouter.get('/inventory/stock-summary', requirePermission('inventory', 'read'), stockSummaryCtl.stockSummary);
