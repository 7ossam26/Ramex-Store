import { api } from './api';
import type {
  Color,
  CreateFabricInput,
  CreateTopBatchInput,
  CreateTopBatchResult,
  DamageEvent,
  DamageReasonCode,
  DamageDisposition,
  Fabric,
  FabricFull,
  RollStatus,
  Shipment,
  ShipmentStatus,
  ShipmentWithLines,
  StockMovement,
  Stocktake,
  StocktakeWithLines,
  StocktakeMode,
  UpdateFabricInput,
  Warehouse,
} from './inventory-types';

export const inventoryApi = {
  // Lookup tables (Phase 1 endpoints)
  listFabrics: () => api.get<Fabric[]>('/fabrics').then((r) => r.data),
  listFabricsFull: () => api.get<FabricFull[]>('/fabrics').then((r) => r.data),
  listColors: () => api.get<Color[]>('/colors').then((r) => r.data),

  // Fabric catalog (Owner only)
  createFabric: (body: CreateFabricInput) =>
    api.post<FabricFull>('/fabrics', body).then((r) => r.data),
  updateFabric: (id: number, body: UpdateFabricInput) =>
    api.patch<FabricFull>(`/fabrics/${id}`, body).then((r) => r.data),

  // One-shot Add-Top wizard
  createTopBatch: (body: CreateTopBatchInput) =>
    api.post<CreateTopBatchResult>('/tops/batch', body).then((r) => r.data),

  // Shipments
  listShipments: (params?: { status?: ShipmentStatus }) =>
    api.get<Shipment[]>('/shipments', { params }).then((r) => r.data),
  getShipment: (id: number) =>
    api.get<ShipmentWithLines>(`/shipments/${id}`).then((r) => r.data),
  createShipmentDraft: (notes_ar?: string) =>
    api.post<Shipment>('/shipments', { notes_ar: notes_ar ?? null }).then((r) => r.data),
  addShipmentRoll: (shipmentId: number, body: {
    fabric_id: number;
    color_id: number;
    weight_kg: number;
    roll_sr_no?: string;
    order_no?: string;
    factory_purchase_price_egp?: number;
  }) =>
    api.post(`/shipments/${shipmentId}/rolls`, body).then((r) => r.data),
  removeShipmentLine: (shipmentId: number, lineId: number) =>
    api.delete(`/shipments/${shipmentId}/lines/${lineId}`).then((r) => r.data),
  submitShipment: (shipmentId: number) =>
    api.post<Shipment>(`/shipments/${shipmentId}/submit`).then((r) => r.data),
  reviewShipmentLine: (shipmentId: number, lineId: number, body: { action: 'accept' | 'reject'; reject_reason_ar?: string | null }) =>
    api.post(`/shipments/${shipmentId}/lines/${lineId}/review`, body).then((r) => r.data),
  finalizeShipment: (shipmentId: number) =>
    api.post<Shipment>(`/shipments/${shipmentId}/finalize`).then((r) => r.data),

  // Damage
  listDamageEvents: (params?: { roll_id?: number; reason_code?: DamageReasonCode; requires_approval?: boolean }) =>
    api.get<DamageEvent[]>('/damage-events', { params }).then((r) => r.data),
  createDamageEvent: (body: {
    roll_id: number;
    reason_code: DamageReasonCode;
    disposition?: DamageDisposition;
    notes_ar?: string;
  }) => api.post<DamageEvent>('/damage-events', body).then((r) => r.data),
  approveDamageEvent: (id: number, approve: boolean) =>
    api.post(`/damage-events/${id}/approve`, { approve }).then((r) => r.data),

  // Stocktakes
  listStocktakes: () => api.get<Stocktake[]>('/stocktakes').then((r) => r.data),
  getStocktake: (id: number) =>
    api.get<StocktakeWithLines>(`/stocktakes/${id}`).then((r) => r.data),
  startStocktake: (body: { mode: StocktakeMode; warehouse: Warehouse; notes_ar?: string }) =>
    api.post<Stocktake>('/stocktakes', body).then((r) => r.data),
  scanStocktake: (id: number, barcode: string) =>
    api.post(`/stocktakes/${id}/scan`, { barcode }).then((r) => r.data),
  recordStocktakeAggregate: (
    id: number,
    body: { fabric_id: number; color_id: number; actual_count: number; actual_weight_kg?: number },
  ) => api.post(`/stocktakes/${id}/aggregate`, body).then((r) => r.data),
  completeStocktake: (id: number) =>
    api.post(`/stocktakes/${id}/complete`).then((r) => r.data),

  // Adjustments
  listAdjustments: () => api.get<StockMovement[]>('/adjustments').then((r) => r.data),
  createAdjustment: (body: {
    roll_id: number;
    new_warehouse?: Warehouse;
    new_status?: RollStatus;
    new_weight_kg?: number;
    notes_ar: string;
  }) => api.post<StockMovement>('/adjustments', body).then((r) => r.data),

  // Stock Movements (ledger)
  listStockMovements: (params: {
    roll_id?: number;
    event_type?: string;
    limit?: number;
    offset?: number;
  }) =>
    api
      .get<{ rows: StockMovement[]; total: number }>('/stock-movements', { params })
      .then((r) => r.data),
};
