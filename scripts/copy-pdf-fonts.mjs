import { mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';

const src = resolve('backend/src/lib/pdf/fonts');
const dst = resolve('backend/dist/lib/pdf/fonts');

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);
