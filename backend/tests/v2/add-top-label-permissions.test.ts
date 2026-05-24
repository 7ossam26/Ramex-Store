import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('v2 - Add Top label permissions', () => {
  it('allows factory sender to request supplier label PDFs created from Add Top', () => {
    const routesSource = readFileSync(
      new URL('../../src/domain/items/items.routes.ts', import.meta.url),
      'utf8',
    );

    expect(routesSource).toMatch(
      /\/rolls\/fabric-labels\/batch[\s\S]*requireRole\([^)]*factory_sender[^)]*\)/,
    );
    expect(routesSource).toMatch(
      /\/rolls\/:id\/fabric-label[\s\S]*requireRole\([^)]*factory_sender[^)]*\)/,
    );
  });
});
