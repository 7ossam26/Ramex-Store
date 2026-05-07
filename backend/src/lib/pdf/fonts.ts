import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled Arabic font (Amiri) used for the invoice PDF. The TTF files
 * live alongside this module under `fonts/`. Path resolution works for
 * both `tsx` (sources) and the compiled `dist/` output because the
 * fonts are copied during build (see `scripts/copy-pdf-fonts.mjs`).
 */
export const FONT_DIR = path.join(here, 'fonts');

export const PDF_FONTS = {
  Amiri: {
    normal: path.join(FONT_DIR, 'Amiri-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Amiri-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Amiri-Regular.ttf'),
    bolditalics: path.join(FONT_DIR, 'Amiri-Bold.ttf'),
  },
};
