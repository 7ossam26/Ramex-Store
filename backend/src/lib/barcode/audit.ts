import type { Request } from 'express';
import { auditLog } from '../../middleware/audit.js';

export async function auditLabelReprinted(
  req: Request,
  rollId: number,
  reason: string,
): Promise<void> {
  await auditLog(
    req,
    'label_reprinted',
    'roll',
    rollId,
    null,
    { reason },
    { severity: 'low' },
  );
}
