import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as ctl from './stockRequests.controller.js';

/**
 * Permission model:
 *  - the SHOP asks / cancels / asks for replacements  -> stock_requests.write
 *  - the FACTORY prepares (opens the linked draft, marks unavailable)  -> stock_request_fulfilment.write
 *    Scanning, removing and sending use the existing /shipments/:id/rolls, /lines and
 *    /submit endpoints. Those are creator-only, and only a fulfilment user can create a
 *    request's draft, so a shop user can never operate a request shipment even though the
 *    stored matrix gives shop_seller shipments.write (see migration 105).
 */
export const stockRequestsRouter = Router();

stockRequestsRouter.use(requireAuth, requireActiveSession);

// static paths first, so they are not swallowed by /:id
stockRequestsRouter.get('/available-rolls', requirePermission('stock_requests', 'write'), ctl.availableRolls);
stockRequestsRouter.get('/summary', requirePermission('stock_requests', 'read'), ctl.summary);

stockRequestsRouter.get('/', requirePermission('stock_requests', 'read'), ctl.list);
stockRequestsRouter.post('/', requirePermission('stock_requests', 'write'), ctl.create);
stockRequestsRouter.get('/:id', requirePermission('stock_requests', 'read'), ctl.get);

stockRequestsRouter.post('/:id/items', requirePermission('stock_requests', 'write'), ctl.addItems);
stockRequestsRouter.post('/:id/items/:itemId/cancel', requirePermission('stock_requests', 'write'), ctl.cancelItem);
stockRequestsRouter.post('/:id/cancel', requirePermission('stock_requests', 'write'), ctl.cancelRequest);

stockRequestsRouter.post('/:id/items/:itemId/unavailable', requirePermission('stock_request_fulfilment', 'write'), ctl.markUnavailable);
stockRequestsRouter.post('/:id/shipments', requirePermission('stock_request_fulfilment', 'write'), ctl.openDraft);
