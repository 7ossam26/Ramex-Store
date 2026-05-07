export const eventTypeLabels: Record<string, string> = {
  stale_invoice: 'فاتورة مفتوحة متأخرة',
  stock_adjustment: 'تعديل مخزون',
  void_requested: 'طلب إلغاء فاتورة',
  cash_discrepancy: 'فارق في الخزنة',
  damage_loss_logged: 'تلف مسجل',
  theft_detected: 'سرقة / فقدان',
  shipment_arrived: 'طلبية جديدة',
  shipment_partial_reject: 'طلبية مرفوضة جزئياً',
  approval_needed: 'موافقة مطلوبة',
  return_processed: 'مرتجع / استبدال',
};

export const severityLabels: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالي',
  critical: 'حرج',
};

export function getEventTypeLabel(eventType: string): string {
  return eventTypeLabels[eventType] ?? eventType;
}

export function getSeverityLabel(severity: string): string {
  return severityLabels[severity] ?? severity;
}
