import { describe, it, expect } from 'vitest';
import { priceUnitLabel } from '../src/lib/fabric-unit';

describe('priceUnitLabel', () => {
  it('returns كجم for kg-fabrics', () => {
    expect(priceUnitLabel('kg')).toBe('كجم');
    expect(priceUnitLabel({ unit: 'kg' })).toBe('كجم');
  });

  it('returns م for meter-fabrics', () => {
    expect(priceUnitLabel('meter')).toBe('م');
    expect(priceUnitLabel({ unit: 'meter' })).toBe('م');
  });
});
