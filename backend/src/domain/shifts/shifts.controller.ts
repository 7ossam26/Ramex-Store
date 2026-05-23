import type { NextFunction, Request, Response } from 'express';
import { db } from '../../db/connection.js';
import * as svc from './shifts.service.js';
import { shiftReportService } from './shiftReportService.js';
import { CloseShiftSchema, ListShiftsQuerySchema, OpenShiftSchema } from './shifts.schemas.js';
import { dailyReportToExportSections } from '../reports/dailyReportService.js';
import { buildReportPdf } from '../../lib/reports/pdfExport.js';
import { buildReportExcel } from '../../lib/reports/excelExport.js';
import { buildPrintableHtml } from '../../lib/reports/printableHtml.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  NO_OPEN_SHIFT: { status: 409, message: 'لا توجد وردية مفتوحة حالياً' },
  STALE_OPEN_SHIFT: { status: 409, message: 'يجب إغلاق وردية الأمس أولاً' },
};

function handleErr(e: unknown, res: Response): boolean {
  if (e instanceof Error && ERR_MAP[e.message]) {
    const { status, message } = ERR_MAP[e.message]!;
    res.status(status).json({ error: e.message, message });
    return true;
  }
  return false;
}

function actorId(req: Request): number {
  return Number(req.user!.sub);
}

export async function getCurrentShift(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shift = await svc.getCurrentShift();
    res.json(shift ?? null);
  } catch (e) {
    next(e);
  }
}

export async function openShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = OpenShiftSchema.parse(req.body);
    const shift = await svc.openShift(actorId(req), body.notes_ar ?? null);
    res.status(201).json(shift);
  } catch (e) {
    if (handleErr(e, res)) return;
    next(e);
  }
}

export async function closeShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CloseShiftSchema.parse(req.body);
    const shift = await svc.closeShift(actorId(req), body.notes_ar ?? null);
    res.json(shift);
  } catch (e) {
    if (handleErr(e, res)) return;
    next(e);
  }
}

export async function listShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = ListShiftsQuerySchema.parse(req.query);
    res.json(await svc.listShifts(q));
  } catch (e) {
    next(e);
  }
}

export async function getShiftReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'INVALID_ID', message: 'معرف الوردية غير صحيح' });
      return;
    }
    const shift = await db('shifts').where({ id }).first();
    if (!shift) {
      res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'الوردية غير موجودة' });
      return;
    }
    const report = await shiftReportService(id);
    res.json(report);
  } catch (e) {
    next(e);
  }
}

export async function exportShiftReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const format = req.query['format'] as string | undefined;

    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'INVALID_ID', message: 'معرف الوردية غير صحيح' });
      return;
    }

    const shift = await db('shifts').where({ id }).first();
    if (!shift) {
      res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'الوردية غير موجودة' });
      return;
    }

    const report = await shiftReportService(id);
    const sections = dailyReportToExportSections(report);

    if (format === 'excel') {
      const buf = await buildReportExcel(sections);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="shift-${id}.xlsx"`);
      res.send(buf);
    } else if (format === 'print') {
      const html = buildPrintableHtml(sections);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const buf = await buildReportPdf(sections);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="shift-${id}.pdf"`);
      res.send(buf);
    }
  } catch (e) {
    next(e);
  }
}
