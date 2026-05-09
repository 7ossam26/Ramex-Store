import type { Request, Response } from 'express';
import { CreateTopBatchSchema } from './tops.schemas.js';
import * as svc from './tops.service.js';
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
      if (e.message === 'NO_DEFAULT_PRICE') {
        res.status(422).json({
          error: 'no_default_price',
          message: 'لا يوجد سعر افتراضي لهذا اللون، يجب تحديد السعر يدوياً',
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
