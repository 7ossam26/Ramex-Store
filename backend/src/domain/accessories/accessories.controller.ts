import type { Request, Response } from 'express';
import { CreateAccessorySchema, UpdateAccessorySchema, SearchAccessoriesQuerySchema } from './accessories.schemas.js';
import * as svc from './accessories.service.js';
import { auditLog } from '../../middleware/audit.js';
import bwipjs from 'bwip-js/node';
import pdfmake from 'pdfmake';
import { PDF_FONTS } from '../../lib/pdf/fonts.js';

export async function createAccessory(req: Request, res: Response): Promise<void> {
  const data = CreateAccessorySchema.parse(req.body);
  const actorUserId = req.user!.sub;
  const result = await svc.createAccessory(data, actorUserId);
  await auditLog(req, 'create_accessory', 'accessory', result.id, null, {
    id: result.id,
    internal_barcode: result.internal_barcode,
    name_ar: result.name_ar,
    qty_in_stock: result.qty_in_stock,
  }, { severity: 'medium' });
  res.status(201).json(result);
}

export async function listAccessories(req: Request, res: Response): Promise<void> {
  const { q, is_active } = SearchAccessoriesQuerySchema.parse(req.query);
  const rows = await svc.listAccessories({ q, is_active });
  res.json(rows);
}

export async function searchAccessories(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? '');
  const rows = q ? await svc.searchAccessories(q) : await svc.listAccessories({ is_active: true });
  res.json(rows);
}

export async function getAccessoryByBarcode(req: Request, res: Response): Promise<void> {
  const row = await svc.getAccessoryByBarcode(req.params.barcode as string);
  if (!row) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(row);
}

export async function getAccessory(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const row = await svc.getAccessoryById(id);
  if (!row) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(row);
}

export async function updateAccessory(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const patch = UpdateAccessorySchema.parse(req.body);
  const actorUserId = req.user!.sub;
  try {
    const result = await svc.updateAccessory(id, patch, actorUserId);
    res.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'ACCESSORY_NOT_FOUND') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    throw e;
  }
}

let fontsConfigured = false;
function ensureFonts() {
  if (fontsConfigured) return;
  const pm = pdfmake as unknown as {
    setFonts: (f: typeof PDF_FONTS) => void;
  };
  pm.setFonts(PDF_FONTS);
  fontsConfigured = true;
}

export async function getAccessoryLabel(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const row = await svc.getAccessoryById(id);
  if (!row) { res.status(404).json({ error: 'not_found' }); return; }

  // Generate barcode PNG
  const barcodePng = await bwipjs.toBuffer({
    bcid: 'code128',
    text: row.internal_barcode,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });
  const barcodeDataUrl = `data:image/png;base64,${barcodePng.toString('base64')}`;

  ensureFonts();
  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };

  const MM_TO_PT = 2.8346;
  const W = 100 * MM_TO_PT;
  const H = 60 * MM_TO_PT;

  const docDef = {
    pageSize: { width: W, height: H },
    pageMargins: [8, 8, 8, 8] as [number, number, number, number],
    defaultStyle: { font: 'Cairo', fontSize: 9 },
    content: [
      {
        image: barcodeDataUrl,
        fit: [W - 20, H - 40] as [number, number],
        alignment: 'center',
        margin: [0, 12, 0, 0] as [number, number, number, number],
      },
    ],
  };

  const pdf = await pm.createPdf(docDef).getBuffer();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="accessory-label-${row.internal_barcode}.pdf"`);
  res.end(pdf);
}
