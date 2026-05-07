import type { Request, Response } from 'express';
import * as svc from './users.service.js';

export async function meCtl(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).end();
    return;
  }
  const u = await svc.findById(req.user.sub);
  if (!u) {
    res.status(404).end();
    return;
  }
  res.json(u);
}

export async function listCtl(_req: Request, res: Response): Promise<void> {
  res.json(await svc.listAll());
}
