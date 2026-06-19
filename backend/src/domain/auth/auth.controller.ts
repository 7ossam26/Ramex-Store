import type { Request, Response } from 'express';
import { LoginSchema, ChangePasswordSchema } from './auth.schemas.js';
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

  if ('code' in result) {
    if (result.code === 'ACCOUNT_LOCKED') {
      await auditLog(req, 'login_blocked', 'auth', input.username, null, null, { severity: 'medium' });
      res.status(401).json({ error: 'ACCOUNT_LOCKED', lockedUntil: result.lockedUntil });
      return;
    }
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

export async function changePasswordCtl(req: Request, res: Response): Promise<void> {
  const input = ChangePasswordSchema.parse(req.body);
  const result = await svc.changePassword(req.user!.sub, input.currentPassword, input.newPassword);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  await auditLog(req, 'password_changed', 'auth', req.user!.sub, null, null, { userId: req.user!.sub });
  res.json({ ok: true });
}
