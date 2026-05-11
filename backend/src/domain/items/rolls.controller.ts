import type { Request, Response } from 'express';
import {
  CreateRollSchema, UpdateRollSchema, ListRollsQuerySchema,
  FabricLabelQuerySchema, BatchFabricLabelSchema,
} from './items.schemas.js';
import * as svc from './rolls.service.js';
import { auditLog } from '../../middleware/audit.js';
import { buildSingleLabelPdf, buildBatchLabelPdf } from '../../lib/barcode/labelPdf.js';
import { renderRollLabelThermal, renderRollLabelsThermal, renderRollLabelA4 } from '../../lib/barcode/fabricLabelService.js';
import { auditLabelReprinted } from '../../lib/barcode/audit.js';

export async function listRolls(req: Request, res: Response): Promise<void> {
  const filters = ListRollsQuerySchema.parse(req.query);
  res.json(await svc.listRolls(filters));
}

export async function createRoll(req: Request, res: Response): Promise<void> {
  const data = CreateRollSchema.parse(req.body);
  let roll;
  try {
    roll = await svc.createRoll(data);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NO_DEFAULT_PRICE') {
      res.status(422).json({
        error: 'لا يوجد سعر افتراضي لهذا الصنف واللون، يجب تحديد السعر يدوياً',
      });
      return;
    }
    throw e;
  }
  await auditLog(req, 'create_roll', 'roll', roll.id, null, roll, { severity: 'medium' });
  res.status(201).json(roll);
}

export async function updateRoll(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateRollSchema.parse(req.body);
  const before = await svc.getRoll(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateRoll(id, data);
  await auditLog(req, 'update_roll', 'roll', id, before, after, { severity: 'medium' });
  res.json(after);
}

export async function findByBarcode(req: Request, res: Response): Promise<void> {
  const roll = await svc.findByBarcode(req.params.barcode as string);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(roll);
}

export async function togglePosVisibility(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const before = await svc.getRoll(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.togglePosVisibility(id);
  await auditLog(
    req,
    'toggle_pos_visibility',
    'roll',
    id,
    { is_visible_at_pos: before.is_visible_at_pos },
    { is_visible_at_pos: after?.is_visible_at_pos },
    { severity: 'low' },
  );
  res.json(after);
}

export async function searchRolls(req: Request, res: Response): Promise<void> {
  const { fabric, color, rollSrNo, barcodePartial } = req.query as Record<string, string | undefined>;
  const results = await svc.searchRolls({ fabric, color, rollSrNo, barcodePartial });
  res.json(results);
}

export async function getRollDetail(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const roll = await svc.getRollWithLabel(id);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(roll);
}

// Legacy barcode label (existing simple label)
export async function getLabelPdf(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const roll = await svc.getRoll(id);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }
  const pdf = await buildSingleLabelPdf(roll);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="label-${roll.internal_barcode}.pdf"`);
  res.end(pdf);
}

export async function getBatchLabelsPdf(req: Request, res: Response): Promise<void> {
  const { rollIds } = req.body as { rollIds: number[] };
  if (!Array.isArray(rollIds) || rollIds.length === 0) {
    res.status(400).json({ error: 'rollIds must be a non-empty array' });
    return;
  }
  const rolls = await Promise.all(rollIds.map((id) => svc.getRoll(id)));
  const valid = rolls.filter((r): r is NonNullable<typeof r> => r !== undefined);
  if (valid.length === 0) { res.status(404).json({ error: 'no_rolls_found' }); return; }
  const pdf = await buildBatchLabelPdf(valid);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="labels-batch.pdf"');
  res.end(pdf);
}

export async function reprintLabel(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const roll = await svc.getRoll(id);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }
  const reason = (req.body as { reason?: string }).reason ?? 'lost_label';
  const pdf = await buildSingleLabelPdf(roll);
  await auditLabelReprinted(req, id, reason);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="label-reprint-${roll.internal_barcode}.pdf"`);
  res.end(pdf);
}

// Fabric label — full 12-field supplier sticker
export async function getFabricLabel(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { format } = FabricLabelQuerySchema.parse(req.query);

  const roll = await svc.getRollWithLabel(id);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }

  const pdf = format === 'a4'
    ? await renderRollLabelA4([roll])
    : await renderRollLabelThermal(roll);

  await auditLog(req, 'label_printed', 'roll', id, null, { format }, { severity: 'low' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="fabric-label-${roll.internal_barcode}.pdf"`);
  res.end(pdf);
}

export async function getBatchFabricLabels(req: Request, res: Response): Promise<void> {
  const { rollIds, format, perPage } = BatchFabricLabelSchema.parse(req.body);

  const rolls = await svc.getRollsWithLabel(rollIds);
  if (rolls.length === 0) { res.status(404).json({ error: 'no_rolls_found' }); return; }

  const pdf = format === 'a4'
    ? await renderRollLabelA4(rolls, perPage)
    : await renderRollLabelsThermal(rolls);

  await auditLog(req, 'label_printed', 'roll', null, null, { rollIds, format }, { severity: 'low' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="fabric-labels-batch.pdf"');
  res.end(pdf);
}
