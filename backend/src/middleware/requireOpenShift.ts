import type { RequestHandler } from 'express';
import { db } from '../db/connection.js';

declare module 'express-serve-static-core' {
  interface Request {
    shiftId?: number;
  }
}

export const requireOpenShift: RequestHandler = async (req, res, next) => {
  const shift = await db('shifts').where('status', 'open').select('id').first();
  if (!shift) {
    res.status(409).json({
      error: 'NO_OPEN_SHIFT',
      message: 'يجب فتح وردية أولاً قبل البيع',
    });
    return;
  }
  req.shiftId = Number(shift.id);
  next();
};
