import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled Arabic fonts. The files live alongside this module under `fonts/`.
 * Path resolution works for both `tsx` and compiled `dist/` because the fonts
 * are copied during build (see `scripts/copy-pdf-fonts.mjs`).
 */
export const FONT_DIR = path.join(here, 'fonts');

export const PDF_FONTS = {
  Cairo: {
    normal: path.join(FONT_DIR, 'Cairo-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Cairo-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Cairo-Regular.ttf'),
    bolditalics: path.join(FONT_DIR, 'Cairo-Bold.ttf'),
  },
  Amiri: {
    normal: path.join(FONT_DIR, 'Amiri-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Amiri-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Amiri-Regular.ttf'),
    bolditalics: path.join(FONT_DIR, 'Amiri-Bold.ttf'),
  },
};
