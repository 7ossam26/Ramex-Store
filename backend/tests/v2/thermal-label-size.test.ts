import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('v2 - thermal garment label size', () => {
  it('uses 100x150mm for the browser-printable sticker PDF', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/barcode/fabricLabelService.ts'),
      'utf8',
    );

    expect(source).toMatch(/const THERMAL_W = 100 \* MM_TO_PT/);
    expect(source).toMatch(/const THERMAL_H = 150 \* MM_TO_PT/);
  });
});
