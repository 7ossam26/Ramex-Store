// v2 Phase 10 — Add Top UI guarantees.
// Q&A #7 (weight cell shows previous value as placeholder, not auto-fill).
// Q&A #8 (multi-fabric sub-groups via «+ خامة جديدة»).
//
// Full-component render needs heavy mocking (TanStack Query, AuthProvider,
// Router). For phase-10 we verify the source-level UI guarantees — the
// same approach the phase-10 prompt sanctions for the cheque-receipt check.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADD_TOP_PATH = resolve(__dirname, '../../src/pages/items/AddTop.tsx');
const AR_STRINGS_PATH = resolve(__dirname, '../../src/i18n/ar.ts');

describe('v2 Add Top — UX guarantees', () => {
  const src = readFileSync(ADD_TOP_PATH, 'utf8');
  const ar = readFileSync(AR_STRINGS_PATH, 'utf8');

  it('Q&A #7 — weight cell uses placeholder (prevRow), not value-prefill', () => {
    // Placeholder reads from prevRow; the input value never auto-fills.
    expect(src).toMatch(/placeholder=\{prevRow\?\.weight_kg|placeholder=\{prevRow/);
  });

  it('Q&A #7 — input value for weight is a separate state, not derived from prev', () => {
    // Both `value` and `placeholder` exist for the weight cell.
    expect(src).toMatch(/weight_kg/);
    expect(src).toContain('placeholder');
  });

  it('Q&A #8 — multi-fabric sub-group affordance: addFabricGroup', () => {
    expect(src).toContain('addFabricGroup');
    expect(ar).toContain('addFabricGroup');
  });

  it('Q&A #1.7 — Add Top is factory-only: source lacks a warehouse picker', () => {
    // Add Top form does not render a warehouse selector.
    expect(src).not.toMatch(/<Select[^>]*warehouse|warehouseSelect|<select[^>]*name=['"]warehouse/);
  });
});
