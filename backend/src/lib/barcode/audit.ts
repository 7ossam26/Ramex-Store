import type { Request } from 'express';
import { auditLog } from '../../middleware/audit.js';

export async function auditLabelReprinted(
  req: Request,
  entityId: number,
  reason: string,
  entity: 'roll' | 'accessory' = 'roll',
): Promise<void> {
  await auditLog(
    req,
    'label_reprinted',
    entity,
    entityId,
    null,
    { reason },
    { severity: 'low' },
  );
}
