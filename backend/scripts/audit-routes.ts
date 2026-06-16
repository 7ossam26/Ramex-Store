/**
 * backend/scripts/audit-routes.ts
 *
 * Route permission coverage audit — CI GATE (fails with exit code 1 if any route
 * has no guard and is not explicitly exempted).
 *
 * Usage:  npx tsx backend/scripts/audit-routes.ts
 *         npx tsx backend/scripts/audit-routes.ts --ci   (same behaviour, explicit)
 *
 * Guard classification:
 *   requirePermission  — matrix-enforced (desired)
 *   requireRole        — hardcoded role gate (acceptable for super_admin-only operations)
 *   inline-check       — manual can() call in route body (acceptable, annotated)
 *   requireAuth        — pre-auth or personal-data endpoint (acceptable)
 *   NONE               — no guard detected → CI failure
 *
 * Known-exempt NONE routes (router-level or inline guards the script cannot statically detect):
 *   These are NOT listed as NONE in the output — the script detects them via improved heuristics.
 *   owner.routes.ts: router-level requireRole('owner','super_admin') on ownerRouter.use(...)
 *   hr.routes.ts POST /adjustments: inline can() call
 *   users.routes.ts GET /me/permissions: protected by router-level requireAuth
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Route file discovery ────────────────────────────────────────────────────

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.endsWith('.routes.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ─── Guard detection ─────────────────────────────────────────────────────────

type GuardType =
  | 'requirePermission'
  | 'requireRole'
  | 'inline-check'
  | 'requireAuth'
  | 'NONE';

type RouteEntry = {
  method: string;
  path: string;
  guard: GuardType;
  detail: string;
  file: string;
};

// Match any identifier.<method>(...) — router names vary per file
const METHOD_RE = /\w+Router?\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;

function detectGuard(block: string): { guard: GuardType; detail: string } {
  if (/requirePermission\s*\(/.test(block)) {
    const m = block.match(/requirePermission\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
    return { guard: 'requirePermission', detail: m ? `${m[1]}.${m[2]}` : '?' };
  }
  // Entity-aware matrix gate in codes.routes.ts (resource resolved per :entity).
  if (/requireCodePermission\s*\(/.test(block)) {
    const m = block.match(/requireCodePermission\s*\(\s*['"`]([^'"`]+)['"`]/);
    return { guard: 'requirePermission', detail: m ? `codes.${m[1]}` : '?' };
  }
  // Inline can() call — e.g. POST /adjustments in hr.routes.ts
  if (/\bcan\s*\(/.test(block)) {
    return { guard: 'inline-check', detail: 'can()' };
  }
  if (/requireRole\s*\(/.test(block)) {
    const m = block.match(/requireRole\s*\(([^)]+)\)/);
    const roles = m ? m[1].replace(/['"\s]/g, '').replace(/,/g, '+') : '?';
    return { guard: 'requireRole', detail: roles };
  }
  if (/requireAuth/.test(block)) {
    return { guard: 'requireAuth', detail: '' };
  }
  return { guard: 'NONE', detail: '' };
}

/** Scan the full file for the router-level .use() guard (not just the first block). */
function detectRouterLevelGuard(src: string): { guard: GuardType; detail: string } {
  // Match <Router>.use(...requireAuth...) or <Router>.use(...requireRole...)
  const useRe = /\w+Router?\.use\s*\(([^;]+)\)/g;
  let bestGuard: GuardType = 'NONE';
  let bestDetail = '';
  let m: RegExpExecArray | null;
  while ((m = useRe.exec(src)) !== null) {
    const { guard, detail } = detectGuard(m[0]);
    if (guard === 'requirePermission') { bestGuard = guard; bestDetail = detail; break; }
    if (guard === 'requireRole' && bestGuard !== 'requirePermission') { bestGuard = guard; bestDetail = detail; }
    if (guard === 'requireAuth' && bestGuard === 'NONE') { bestGuard = guard; bestDetail = detail; }
  }
  return { guard: bestGuard, detail: bestDetail };
}

function parseRouteFile(filePath: string): RouteEntry[] {
  const src = readFileSync(filePath, 'utf-8');
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  const entries: RouteEntry[] = [];

  const routerLevelGuard = detectRouterLevelGuard(src);

  let match: RegExpExecArray | null;
  METHOD_RE.lastIndex = 0;

  while ((match = METHOD_RE.exec(src)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const blockStart = match.index;
    const blockEnd = Math.min(blockStart + 600, src.length);
    const block = src.slice(blockStart, blockEnd);

    let { guard, detail } = detectGuard(block);

    // Inherit router-level guard when no per-route guard is found
    if (guard === 'NONE' && routerLevelGuard.guard !== 'NONE') {
      guard = routerLevelGuard.guard;
      detail = routerLevelGuard.detail;
    }

    entries.push({ method, path, guard, detail, file: rel });
  }

  return entries;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const domainDir = join(ROOT, 'src', 'domain');
const routeFiles = findRouteFiles(domainDir);

const allRoutes: RouteEntry[] = [];
for (const f of routeFiles) {
  allRoutes.push(...parseRouteFile(f));
}

// ─── Summary counts ──────────────────────────────────────────────────────────

const counts: Record<GuardType, number> = {
  requirePermission: 0,
  requireRole: 0,
  'inline-check': 0,
  requireAuth: 0,
  NONE: 0,
};
for (const r of allRoutes) counts[r.guard]++;

// ─── Output ───────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(' Ramex Store — Route Permission Audit (CI gate — fails on NONE routes)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

const guardOrder: GuardType[] = [
  'NONE', 'requireRole', 'inline-check', 'requireAuth', 'requirePermission',
];

for (const guardType of guardOrder) {
  const routes = allRoutes.filter((r) => r.guard === guardType);
  if (routes.length === 0) continue;

  const header =
    guardType === 'NONE'
      ? '✗  NONE — no auth guard detected (CI failure)'
      : guardType === 'requireRole'
      ? '⚙  requireRole — hardcoded role gate (intentional for admin-only operations)'
      : guardType === 'inline-check'
      ? '⚙  inline-check — manual can() in route body (intentional)'
      : guardType === 'requireAuth'
      ? '⚙  requireAuth — pre-auth or personal-data endpoint'
      : '✓  requirePermission — matrix-enforced';

  console.log(header);
  console.log('─'.repeat(70));
  for (const r of routes) {
    const detail = r.detail ? `  [${r.detail}]` : '';
    console.log(`  ${r.method.padEnd(7)} ${r.path.padEnd(45)} ${r.file}${detail}`);
  }
  console.log();
}

console.log('─'.repeat(70));
console.log('Summary:');
const guardPrintOrder: GuardType[] = [
  'requirePermission', 'requireRole', 'inline-check', 'requireAuth', 'NONE',
];
for (const guard of guardPrintOrder) {
  const count = counts[guard];
  if (count === 0) continue;
  const flag = guard === 'NONE' ? ' ✗' : guard === 'requirePermission' ? ' ✓' : '';
  console.log(`  ${guard.padEnd(25)} ${count}${flag}`);
}
console.log(`  ${'TOTAL'.padEnd(25)} ${allRoutes.length}`);
console.log();

const matrixCoverage = counts['requirePermission'];
console.log(`Matrix coverage: ${matrixCoverage}/${allRoutes.length} routes`);

// ─── CI gate ─────────────────────────────────────────────────────────────────

if (counts['NONE'] > 0) {
  console.error(`\n✗ CI FAILURE: ${counts['NONE']} route(s) have no permission guard.\n`);
  process.exit(1);
}

console.log('✓ All routes have permission guards.\n');
