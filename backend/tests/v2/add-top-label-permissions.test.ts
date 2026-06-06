import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('v2 - Add Top label permissions', () => {
  it('fabric-label batch and single-roll endpoints are matrix-gated on fabric_rolls.read', () => {
    const routesSource = readFileSync(
      new URL('../../src/domain/items/items.routes.ts', import.meta.url),
      'utf8',
    );

    expect(routesSource).toMatch(
      /\/rolls\/fabric-labels\/batch[\s\S]*requirePermission\([^)]*fabric_rolls[^)]*read[^)]*\)/,
    );
    expect(routesSource).toMatch(
      /\/rolls\/:id\/fabric-label[\s\S]*requirePermission\([^)]*fabric_rolls[^)]*read[^)]*\)/,
    );
  });
});
