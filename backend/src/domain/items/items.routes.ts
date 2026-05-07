import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as fabricsCtl from './fabrics.controller.js';
import * as colorsCtl from './colors.controller.js';
import * as pricesCtl from './prices.controller.js';
import * as rollsCtl from './rolls.controller.js';

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

// Rolls — by-barcode must come before /:id to avoid conflict
itemsRouter.get('/rolls/by-barcode/:barcode', rollsCtl.findByBarcode);
itemsRouter.get('/rolls', rollsCtl.listRolls);
itemsRouter.post('/rolls', requireRole('owner'), rollsCtl.createRoll);
itemsRouter.patch('/rolls/:id', requireRole('owner'), rollsCtl.updateRoll);
itemsRouter.post('/rolls/:id/toggle-pos-visibility', requireRole('owner'), rollsCtl.togglePosVisibility);
