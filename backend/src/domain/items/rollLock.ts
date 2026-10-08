/**
 * A توب «قيد الشحن» belongs to a طلبية until the shop reviews it: nothing may
 * change its quantity, status or data in the meantime, otherwise the shop
 * receives something different from what the factory sent.
 */
export const ROLL_IN_TRANSIT_MESSAGE = 'لا يمكن تعديل توب قيد الشحن — التوب مضاف إلى طلبية';

export function assertRollNotInTransit(roll: { status: string }): void {
  if (roll.status === 'in_transit') throw new Error('ROLL_IN_TRANSIT');
}
