import { rm, cp } from 'node:fs/promises';
import { resolve } from 'node:path';

const src = resolve('frontend/dist');
const dst = resolve('backend/public');

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);
