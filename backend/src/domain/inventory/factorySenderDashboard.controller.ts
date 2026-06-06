import type { Request, Response } from 'express';
import { db } from '../../db/connection.js';

export async function getFactorySenderDashboard(req: Request, res: Response): Promise<void> {
  const actorId = Number(req.user!.sub);

  const [factoryStock, availableRolls, weekShipments, pendingShipments, rejectedLines] =
    await Promise.all([
      db('rolls')
        .where({ warehouse: 'factory', status: 'in_stock' })
        .select(
          db.raw('COUNT(*) as roll_count'),
          db.raw('COALESCE(SUM(CAST(weight_kg AS numeric)), 0) as total_kg'),
          db.raw('COALESCE(SUM(CAST(length_m AS numeric)), 0) as total_meters'),
        )
        .first(),

      db('rolls')
        .where({ warehouse: 'factory', status: 'in_stock' })
        .whereNotIn(
          'id',
          db('shipment_lines as sl')
            .join('shipments as s', 'sl.shipment_id', 's.id')
            .whereIn('s.status', ['draft', 'pending_approval', 'partial_approved'])
            .select('sl.roll_id'),
        )
        .count('id as count')
        .first(),

      db('shipments')
        .where({ created_by_user_id: actorId })
        .where('created_at', '>=', db.raw("NOW() - INTERVAL '7 days'"))
        .count('id as count')
        .first(),

      db('shipments')
        .where({ created_by_user_id: actorId })
        .whereIn('status', ['pending_approval', 'partial_approved'])
        .count('id as count')
        .first(),

      db('shipment_lines as sl')
        .join('shipments as s', 'sl.shipment_id', 's.id')
        .where('s.created_by_user_id', actorId)
        .where('sl.status', 'rejected')
        .where('sl.updated_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
        .count('sl.id as count')
        .first(),
    ]);

  res.json({
    factory_stock: {
      roll_count: Number(factoryStock?.roll_count ?? 0),
      total_kg: Number(factoryStock?.total_kg ?? 0),
      total_meters: Number(factoryStock?.total_meters ?? 0),
    },
    available_rolls: Number(availableRolls?.count ?? 0),
    shipments_this_week: Number(weekShipments?.count ?? 0),
    pending_shipments: Number(pendingShipments?.count ?? 0),
    rejected_lines_30d: Number(rejectedLines?.count ?? 0),
  });
}
