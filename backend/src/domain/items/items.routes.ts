import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as fabricsCtl from './fabrics.controller.js';
import * as colorsCtl from './colors.controller.js';
import * as pricesCtl from './prices.controller.js';
import * as rollsCtl from './rolls.controller.js';
import * as topsCtl from './tops.controller.js';

export const itemsRouter = Router();

itemsRouter.use(requireAuth, requireActiveSession);

// Fabrics
itemsRouter.get('/fabrics', fabricsCtl.listFabrics);
itemsRouter.post('/fabrics', requireRole('owner'), fabricsCtl.createFabric);
itemsRouter.patch('/fabrics/:id', requireRole('owner'), fabricsCtl.updateFabric);

// Colors
itemsRouter.get('/colors', colorsCtl.listColors);
itemsRouter.post('/colors', requireRole('owner'), colorsCtl.createColor);
itemsRouter.patch('/colors/:id', requireRole('owner'), colorsCtl.updateColor);

// Prices
itemsRouter.get('/fabric-color-prices', pricesCtl.listPrices);
itemsRouter.post('/fabric-color-prices', requireRole('owner'), pricesCtl.upsertPrice);

// Tops batch — one-shot wizard: create fabric (or reuse) + colors + prices + rolls in a single transaction
itemsRouter.post('/tops/batch', requireRole('owner', 'shop_seller'), topsCtl.createTopBatch);

// Rolls — static paths must come before /:id to avoid conflicts
itemsRouter.get('/rolls/by-barcode/:barcode', rollsCtl.findByBarcode);
itemsRouter.get('/rolls/search', rollsCtl.searchRolls);
itemsRouter.post('/rolls/labels-batch', rollsCtl.getBatchLabelsPdf);
// Fabric label batch (full 12-field sticker)
itemsRouter.post('/rolls/fabric-labels/batch', requireRole('owner', 'shop_seller'), rollsCtl.getBatchFabricLabels);
itemsRouter.get('/rolls', rollsCtl.listRolls);
// NOTE: POST /rolls was removed — رولات may only be created through the
// /tops/batch wizard (factory entry) or the factory shipment flow.
// Fabric label for a single roll
itemsRouter.get('/rolls/:id', rollsCtl.getRollDetail);
itemsRouter.get('/rolls/:id/fabric-label', requireRole('owner', 'shop_seller'), rollsCtl.getFabricLabel);
itemsRouter.get('/rolls/:id/label-pdf', rollsCtl.getLabelPdf);
itemsRouter.post('/rolls/:id/reprint-label', rollsCtl.reprintLabel);
itemsRouter.patch('/rolls/:id', requireRole('owner'), rollsCtl.updateRoll);
itemsRouter.post('/rolls/:id/toggle-pos-visibility', requireRole('owner'), rollsCtl.togglePosVisibility);
