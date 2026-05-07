import type { Request, Response } from 'express';
import { LoginSchema } from './auth.schemas.js';
import * as svc from './auth.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function loginCtl(req: Request, res: Response): Promise<void> {
  const input = LoginSchema.parse(req.body);
  const result = await svc.login(
    input.username,
    input.password,
    req.headers['user-agent'] ?? '',
    req.ip ?? '',
  );
  if (!result) {
    await auditLog(req, 'login_failed', 'auth', input.username, null, null, { severity: 'medium' });
    res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    return;
  }
  await auditLog(req, 'login_success', 'auth', result.user.id, null, null, { userId: result.user.id });
  res.json(result);
}

export async function logoutCtl(req: Request, res: Response): Promise<void> {
  if (req.user) {
    await svc.logout(req.user.jti);
    await auditLog(req, 'logout', 'auth', req.user.sub, null, null);
  }
  res.json({ ok: true });
}
