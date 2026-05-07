import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditLog } from '../../middleware/audit.js';
import * as settingsService from './settingsService.js';
import { type SettingKey } from './keys.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireActiveSession);

// GET /api/settings — all settings (Owner only)
settingsRouter.get('/', requireRole('owner'), async (_req, res, next) => {
  try { res.json(await settingsService.getAll()); }
  catch (e) { next(e); }
});

// GET /api/settings/:key — single key (Owner only)
settingsRouter.get('/:key', requireRole('owner'), async (req, res, next) => {
  try {
    const rawKey = req.params['key'];
    const key = decodeURIComponent(Array.isArray(rawKey) ? (rawKey[0] ?? '') : (rawKey ?? '')) as SettingKey;
    const all = await settingsService.getAll();
    if (!(key in all)) {
      res.status(404).json({ error: 'SETTING_NOT_FOUND' });
      return;
    }
    res.json({ key, value: all[key] });
  } catch (e) { next(e); }
});

// PATCH /api/settings/:key — update a setting (Owner only)
settingsRouter.patch('/:key', requireRole('owner'), async (req, res, next) => {
  try {
    const rawKey = req.params['key'];
    const key = decodeURIComponent(Array.isArray(rawKey) ? (rawKey[0] ?? '') : (rawKey ?? '')) as SettingKey;
    const { value } = req.body as { value: unknown };
    await settingsService.set(key, value, req.user!.sub);
    await auditLog(req, 'settings.update', 'settings', key, null, { key, value }, { severity: 'medium' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/settings/:key/history — version history (Owner only)
settingsRouter.get('/:key/history', requireRole('owner'), async (req, res, next) => {
  try {
    const rawKey = req.params['key'];
    const key  = decodeURIComponent(Array.isArray(rawKey) ? (rawKey[0] ?? '') : (rawKey ?? ''));
    const limit = Math.min(100, Number(req.query['limit'] ?? 50));
    res.json(await settingsService.history(key, limit));
  } catch (e) { next(e); }
});
