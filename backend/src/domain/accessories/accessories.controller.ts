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

  // Generate barcode PNG. Matches the roll label: code text is rendered
  // separately below (includetext: false) so it can be styled consistently.
  const barcodePng = await bwipjs.toBuffer({
    bcid: 'code128',
    text: row.internal_barcode,
    scale: 3,
    height: 18,
    includetext: false,
    paddingwidth: 4,
  });
  const barcodeDataUrl = `data:image/png;base64,${barcodePng.toString('base64')}`;

  ensureFonts();
  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };

  const MM_TO_PT = 2.8346;
  const W = 100 * MM_TO_PT;
  const H = 60 * MM_TO_PT;
  const PAGE_MARGIN = 8;

  type PdfMargin = [number, number, number, number];

  // Hairline grid border, identical to the roll label frame.
  const hairlineGrid = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => '#000000',
    vLineColor: () => '#000000',
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };

  const docDef = {
    pageSize: { width: W, height: H },
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN] as PdfMargin,
    defaultStyle: { font: 'Cairo', fontSize: 8.5, alignment: 'center', color: '#000000' },
    content: [
      {
        table: {
          widths: ['*'],
          heights: [100],
          dontBreakRows: true,
          body: [
            [
              {
                stack: [
                  {
                    image: barcodeDataUrl,
                    fit: [240, 60] as [number, number],
                    alignment: 'center' as const,
                    margin: [0, 3, 0, 3] as PdfMargin,
                  },
                  {
                    text: row.internal_barcode,
                    fontSize: 11,
                    bold: true,
                    characterSpacing: 0.7,
                    alignment: 'center' as const,
                    margin: [0, 4, 0, 0] as PdfMargin,
                  },
                ],
                margin: [9, 12, 9, 8] as PdfMargin,
              },
            ],
          ],
        },
        layout: hairlineGrid,
      },
    ],
  };

  const pdf = await pm.createPdf(docDef).getBuffer();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="accessory-label-${row.internal_barcode}.pdf"`);
  res.end(pdf);
}

/**
 * POST /api/accessories/labels/batch
 * Body: { ids: number[] }
 *
 * Generates a single A4 PDF with all accessory labels arranged in a 2-column
 * grid. Each label is a proportionally scaled version of the single-label
 * design produced by getAccessoryLabel above — same barcode, same fonts, same
 * spacing — just sized to fit two per row on an A4 sheet.
 *
 * Scaling derivation (all measurements in mm unless noted):
 *   Original label  : 100 × 60 mm
 *   A4 usable width : 210 − 2×10 margin = 190 mm
 *   Column width    : 190 / 2 cols = 95 mm
 *   Scale factor    : 95 / 100 = 0.95  (5% reduction)
 *   Scaled height   : 60 × 0.95 = 57 mm
 *   Rows per A4 page: ⌊(297−20) / 57⌋ = 4   → 8 labels per page
 *
 * The bwipjs barcode PNG is generated at the same resolution as the
 * single-label endpoint (scale:3, height:18). Only the pdfmake `fit` box
 * is scaled. At ~80 mm rendered width the Code128 barcode remains well
 * above the ISO 15416 minimum scannable width of ~25 mm.
 */
export async function batchLabels(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as { ids: unknown };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array' });
    return;
  }

  const numericIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (numericIds.length === 0) {
    res.status(400).json({ error: 'no valid ids provided' });
    return;
  }

  // Fetch all accessories — skip any not found rather than failing the whole batch.
  const rows = await Promise.all(numericIds.map((id) => svc.getAccessoryById(id)));
  const found = rows.filter((r): r is NonNullable<typeof r> => r !== null);

  if (found.length === 0) {
    res.status(404).json({ error: 'none of the requested accessories were found' });
    return;
  }

  // Generate all barcodes in parallel to minimise latency.
  // Settings are IDENTICAL to getAccessoryLabel — same PNG resolution.
  const barcodeImages = await Promise.all(
    found.map(async (acc) => {
      const buf = await bwipjs.toBuffer({
        bcid: 'code128',
        text: acc.internal_barcode,
        scale: 3,
        height: 18,
        includetext: false,
        paddingwidth: 4,
      });
      return `data:image/png;base64,${buf.toString('base64')}`;
    }),
  );

  ensureFonts();
  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };

  // ── Scaling constants ────────────────────────────────────────────────────
  // Original single-label dimensions (matches getAccessoryLabel exactly).
  const MM_TO_PT = 2.8346;
  const ORIG_W_MM = 100;
  const ORIG_H_MM = 60;

  const COLS = 2;
  const PAGE_MARGIN_MM = 10;
  const PAGE_MARGIN = PAGE_MARGIN_MM * MM_TO_PT; // 28.35 pt

  // A4 usable width in mm → column width → scale factor
  const A4_USABLE_W_MM = 210 - 2 * PAGE_MARGIN_MM;          // 190 mm
  const CELL_W_MM      = A4_USABLE_W_MM / COLS;               // 95 mm
  const SCALE          = CELL_W_MM / ORIG_W_MM;               // 0.95

  // Cell height in pt — used for both layout math and the explicit heights array.
  const CELL_H_PT = ORIG_H_MM * SCALE * MM_TO_PT;             // ≈ 161.6 pt (57 mm)

  // Scaled values derived from the original single-label design.
  // Each original value is multiplied by SCALE so the entire label shrinks
  // proportionally without any redesign.
  type PdfMargin = [number, number, number, number];

  const S = SCALE; // shorthand

  // Original cell margin: [9, 12, 9, 8]
  const CELL_MARGIN: PdfMargin = [
    Math.round(9  * S),   // left
    Math.round(12 * S),   // top
    Math.round(9  * S),   // right
    Math.round(8  * S),   // bottom
  ];

  // Original barcode fit: [240, 60] pt
  const BARCODE_FIT: [number, number] = [
    Math.round(240 * S),  // ~228 pt ≈ 80.5 mm (well above minimum scannable)
    Math.round(60  * S),  // ~57 pt
  ];

  // Original barcode image margin: [0, 3, 0, 3]
  const BARCODE_MARGIN: PdfMargin = [0, Math.round(3 * S), 0, Math.round(3 * S)];

  // Original barcode text margin: [0, 4, 0, 0]
  const TEXT_MARGIN: PdfMargin = [0, Math.round(4 * S), 0, 0];

  const FONT_SIZE         = Math.round(11 * S * 10) / 10;    // ~10.5
  const CHAR_SPACING      = Math.round(0.7 * S * 100) / 100; // ~0.67

  // ── Hairline grid — identical to single-label style ──────────────────────
  const hairlineGrid = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => '#000000',
    vLineColor: () => '#000000',
    paddingLeft:   () => 0,
    paddingRight:  () => 0,
    paddingTop:    () => 0,
    paddingBottom: () => 0,
  };

  // ── Build one cell per accessory ─────────────────────────────────────────
  function makeCell(acc: (typeof found)[number], imgData: string): Record<string, unknown> {
    return {
      stack: [
        {
          image: imgData,
          fit: BARCODE_FIT,
          alignment: 'center' as const,
          margin: BARCODE_MARGIN,
        },
        {
          text: acc.internal_barcode,
          fontSize: FONT_SIZE,
          bold: true,
          characterSpacing: CHAR_SPACING,
          alignment: 'center' as const,
          margin: TEXT_MARGIN,
        },
      ],
      margin: CELL_MARGIN,
    };
  }

  // Chunk accessories into rows of COLS. Pad the last row so the grid stays
  // uniform even when the total count is not evenly divisible by COLS.
  const tableBody: unknown[][] = [];
  for (let i = 0; i < found.length; i += COLS) {
    const row: unknown[] = [];
    for (let col = 0; col < COLS; col++) {
      const idx = i + col;
      row.push(idx < found.length
        ? makeCell(found[idx], barcodeImages[idx])
        : { text: '' }, // empty filler cell
      );
    }
    tableBody.push(row);
  }

  // Explicit heights array — one entry per row — tells pdfmake exactly how
  // tall each row must be. Without this, pdfmake can compute unexpectedly
  // large heights and place one row per page.
  const rowHeights = Array<number>(tableBody.length).fill(Math.round(CELL_H_PT));

  const docDef = {
    pageSize: 'A4' as const,
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN] as PdfMargin,
    defaultStyle: { font: 'Cairo', fontSize: 8.5, alignment: 'center', color: '#000000' },
    content: [
      {
        table: {
          widths: Array<string>(COLS).fill('*'), // two equal columns
          heights: rowHeights,                   // explicit heights prevent pdfmake guessing
          dontBreakRows: true,                   // never split a label across pages
          body: tableBody,
        },
        layout: hairlineGrid,
      },
    ],
  };

  const pdf = await pm.createPdf(docDef).getBuffer();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="accessories-batch-labels.pdf"`);
  res.end(pdf);
}
