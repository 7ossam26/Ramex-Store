import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as shipmentsCtl from './shipments.controller.js';
import * as damageCtl from './damage.controller.js';
import * as stocktakeCtl from './stocktake.controller.js';
import * as adjustmentsCtl from './adjustments.controller.js';
import * as stockMovementsCtl from './stockMovements.controller.js';
import * as stockSummaryCtl from './stockSummary.controller.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth, requireActiveSession);

// --- Shipments ---
// Ahmed (factory_sender) creates and edits drafts; Owner can also.
inventoryRouter.post(
  '/shipments',
  requireRole('factory_sender', 'owner', 'super_admin'),
  shipmentsCtl.createDraft,
);
inventoryRouter.post(
  '/shipments/:id/rolls',
  requireRole('factory_sender', 'owner', 'super_admin'),
  shipmentsCtl.addRoll,
);
inventoryRouter.delete(
  '/shipments/:id/lines/:lineId',
  requireRole('factory_sender', 'owner', 'super_admin'),
  shipmentsCtl.removeLine,
);
inventoryRouter.delete(
  '/shipments/:id',
  requireRole('factory_sender', 'owner', 'super_admin'),
  shipmentsCtl.deleteDraft,
);
inventoryRouter.post(
  '/shipments/:id/submit',
  requireRole('factory_sender', 'owner', 'super_admin'),
  shipmentsCtl.submit,
);

// Ziad (shop_seller) reviews + accepts; Owner can also.
inventoryRouter.post(
  '/shipments/:id/lines/:lineId/review',
  requireRole('shop_seller', 'owner', 'super_admin'),
  shipmentsCtl.reviewLine,
);
inventoryRouter.post(
  '/shipments/:id/accept',
  requireRole('shop_seller', 'owner', 'super_admin'),
  shipmentsCtl.acceptShipment,
);

// Picker for Ahmed: list رولات currently in factory + not in any active shipment line.
inventoryRouter.get(
  '/shipments/factory-rolls',
  requireRole('factory_sender', 'owner', 'super_admin'),
  shipmentsCtl.listFactoryRolls,
);

// All roles can list/view shipments (filters narrow visibility).
inventoryRouter.get('/shipments', shipmentsCtl.listShipments);
inventoryRouter.get('/shipments/:id', shipmentsCtl.getShipment);

// --- Damage Events ---
inventoryRouter.post(
  '/damage-events',
  requireRole('shop_seller', 'owner', 'super_admin'),
  damageCtl.createDamageEvent,
);
inventoryRouter.post(
  '/damage-events/:id/approve',
  requireRole('owner', 'super_admin'),
  damageCtl.approveOrReject,
);
inventoryRouter.get('/damage-events', damageCtl.listDamageEvents);
inventoryRouter.get('/damage-events/:id', damageCtl.getDamageEvent);

// --- Stocktakes ---
inventoryRouter.post(
  '/stocktakes',
  requireRole('shop_seller', 'owner', 'super_admin'),
  stocktakeCtl.start,
);
inventoryRouter.post(
  '/stocktakes/:id/scan',
  requireRole('shop_seller', 'owner', 'super_admin'),
  stocktakeCtl.scan,
);
inventoryRouter.post(
  '/stocktakes/:id/aggregate',
  requireRole('shop_seller', 'owner', 'super_admin'),
  stocktakeCtl.aggregate,
);
inventoryRouter.post(
  '/stocktakes/:id/complete',
  requireRole('shop_seller', 'owner', 'super_admin'),
  stocktakeCtl.complete,
);
inventoryRouter.get('/stocktakes', stocktakeCtl.list);
inventoryRouter.get('/stocktakes/:id', stocktakeCtl.get);

// --- Adjustments ---
inventoryRouter.post(
  '/adjustments',
  requireRole('shop_seller', 'owner', 'super_admin'),
  adjustmentsCtl.createAdjustment,
);
inventoryRouter.get('/adjustments', adjustmentsCtl.listAdjustments);

// --- Stock Movements (read-only ledger) ---
inventoryRouter.get('/stock-movements', stockMovementsCtl.listStockMovements);

// --- Stock Summary (inventory landing) ---
inventoryRouter.get('/inventory/stock-summary', stockSummaryCtl.stockSummary);
