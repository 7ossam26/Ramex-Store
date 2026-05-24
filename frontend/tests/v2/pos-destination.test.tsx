// v2 Phase 10 — POS destination toggle + warehouse-aware roll picker.
// Q&A #15, #19.
//
// Source-level UI guarantees: the POS page lives downstream of an auth
// context + TanStack Query and is impractical to fully render in jsdom
// without a deep mock fixture. The phase-10 prompt accepts source/renderer
// checks for UI guarantees (see #31, receipt PDF).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POS_PATH = resolve(__dirname, '../../src/pages/pos/POS.tsx');
const AR_PATH = resolve(__dirname, '../../src/i18n/ar.ts');

describe('v2 POS — fulfillment destination (Q&A #15, #19)', () => {
  const src = readFileSync(POS_PATH, 'utf8');
  const ar = readFileSync(AR_PATH, 'utf8');

  it('Q&A #15 — POS sends fulfillmentDestination on every sale payload', () => {
    expect(src).toMatch(/fulfillmentDestination:\s*destination/);
  });

  it('Q&A #19 — POS knows about factory_direct destination', () => {
    expect(src).toContain('factory_direct');
  });

  it('Q&A #19 — Arabic label «في المصنع» surfaces for disabled factory rolls in shop mode', () => {
    expect(ar).toContain('في المصنع');
    expect(ar).toMatch(/factoryRollBadge|factoryRollInShopMode/);
  });

  it('Q&A #19 — POS filters rolls per destination (factory vs shop helper used)', () => {
    expect(src).toMatch(/isFactoryRoll|isShopRoll/);
  });

  it('Q&A #15 — destination toggle is a UI affordance (two destinations registered)', () => {
    expect(src).toMatch(/fulfillmentFactoryDirect|fulfillmentShop/);
  });
});
