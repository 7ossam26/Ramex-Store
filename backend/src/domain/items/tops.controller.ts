import type { NextFunction, Request, Response } from 'express';
import { CreateTopBatchSchema, SplitTopSchema } from './tops.schemas.js';
import * as svc from './tops.service.js';
import { TopSplitError } from './tops.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function createTopBatch(req: Request, res: Response): Promise<void> {
  const data = CreateTopBatchSchema.parse(req.body);
  const actorUserId = req.user!.sub;

  let result;
  try {
    result = await svc.createTopBatch(data, actorUserId);
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === 'FABRIC_NOT_FOUND') {
        res.status(404).json({ error: 'fabric_not_found', message: 'الخامة غير موجودة' });
        return;
      }
      if (e.message === 'COLOR_NOT_FOUND') {
        res.status(404).json({ error: 'color_not_found', message: 'اللون غير موجود' });
        return;
      }
      if (e.message === 'FABRIC_CODE_EXISTS') {
        res.status(409).json({
          error: 'fabric_code_exists',
          message: 'كود الخامة مستخدم بالفعل',
        });
        return;
      }
      if (e.message === 'LOT_NOT_FOUND') {
        res.status(404).json({ error: 'lot_not_found', message: 'الدفعة غير موجودة' });
        return;
      }
      if (e.message === 'LOT_FABRIC_COLOR_MISMATCH') {
        res.status(400).json({
          error: 'lot_fabric_color_mismatch',
          message: 'الدفعة المختارة لا تطابق الخامة واللون',
        });
        return;
      }
    }
    throw e;
  }

  await auditLog(
    req,
    'create_top_batch',
    'fabric',
    result.fabric.id,
    null,
    {
      fabric_id: result.fabric.id,
      fabric_code: result.fabric.code,
      roll_count: result.rolls.length,
      roll_ids: result.rolls.map((r) => r.id),
      barcodes: result.rolls.map((r) => r.internal_barcode),
    },
    { severity: 'medium' },
  );

  res.status(201).json(result);
}

export async function splitTop(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rollId = Number(req.params.id);
  if (isNaN(rollId)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { newQuantity } = SplitTopSchema.parse(req.body);
  const actorUserId = req.user!.sub;

  try {
    const result = await svc.splitTop(rollId, newQuantity, actorUserId);

    await auditLog(
      req,
      'split_top',
      'roll',
      rollId,
      null,
      {
        original_roll_id: rollId,
        rib_roll_id: result.rib.id,
        rib_barcode: result.rib.internal_barcode,
      },
      { severity: 'medium' },
    );

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof TopSplitError) {
      const status =
        err.code === 'ROLL_NOT_FOUND' ? 404
        : err.code === 'ROLL_NOT_SPLITTABLE' || err.code === 'ROLL_QUANTITY_MISSING' || err.code === 'INVALID_SPLIT_QUANTITY' ? 422
        : 400;
      res.status(status).json({ error: err.code, message: err.message });
      return;
    }
    next(err);
  }
}
