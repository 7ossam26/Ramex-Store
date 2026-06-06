/**
 * backend/scripts/audit-routes.ts
 *
 * Route permission coverage audit — REPORT ONLY (no CI failure in Phase 1-4).
 * Phase 5 will add the CI failure gate once all routes are mapped.
 *
 * Usage:  npx tsx backend/scripts/audit-routes.ts
 *
 * Output: A table showing every HTTP route in the backend, its file, and
 * which guard protects it (requirePermission, requireRole, requireAuth, or NONE).
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
  | 'requireHrPerm'        // custom wrapper — not yet migrated
  | 'requireSupplierPerm'  // custom wrapper — not yet migrated
  | 'requireReportAccess'  // custom wrapper — not yet migrated
  | 'requireAuth'
  | 'NONE';

type RouteEntry = {
  method: string;
  path: string;
  guard: GuardType;
  detail: string;
  file: string;
};

// Match any identifier.<method>(...) — router names vary per file (authRouter, usersRouter, etc.)
const METHOD_RE = /\w+Router?\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;

function detectGuard(block: string): { guard: GuardType; detail: string } {
  if (/requirePermission\s*\(/.test(block)) {
    const m = block.match(/requirePermission\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
    return { guard: 'requirePermission', detail: m ? `${m[1]}.${m[2]}` : '?' };
  }
  if (/requireHrPerm\s*\(/.test(block)) {
    const m = block.match(/requireHrPerm\s*\(\s*['"`]([^'"`]+)['"`]/);
    return { guard: 'requireHrPerm', detail: m ? `hr.${m[1]}` : '?' };
  }
  if (/requireSupplierPerm\s*\(/.test(block)) {
    const m = block.match(/requireSupplierPerm\s*\(\s*['"`]([^'"`]+)['"`]/);
    return { guard: 'requireSupplierPerm', detail: m ? `suppliers.${m[1]}` : '?' };
  }
  if (/requireReportAccess\s*\(/.test(block)) {
    const m = block.match(/requireReportAccess\s*\(\s*['"`]([^'"`]+)['"`]/);
    return { guard: 'requireReportAccess', detail: m ? `reports.${m[1]}` : '?' };
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

function parseRouteFile(filePath: string): RouteEntry[] {
  const src = readFileSync(filePath, 'utf-8');
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  const entries: RouteEntry[] = [];

  // Check for router-level middleware (applies to all routes in the file)
  const routerLevelGuard = detectGuard(
    src.slice(0, Math.min(src.indexOf('\n\n'), 1500)),
  );

  let match: RegExpExecArray | null;
  METHOD_RE.lastIndex = 0;

  while ((match = METHOD_RE.exec(src)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    // Extract a block of code after the route registration (enough to find guards)
    const blockStart = match.index;
    const blockEnd = Math.min(blockStart + 600, src.length);
    const block = src.slice(blockStart, blockEnd);

    let { guard, detail } = detectGuard(block);

    // If no specific guard found on this route, fall back to router-level guard
    if (guard === 'requireAuth' && routerLevelGuard.guard !== 'requireAuth' && routerLevelGuard.guard !== 'NONE') {
      // still show requireAuth explicitly
    }

    if (method === 'USE') continue; // skip middleware registrations

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
  requireHrPerm: 0,
  requireSupplierPerm: 0,
  requireReportAccess: 0,
  requireAuth: 0,
  NONE: 0,
};
for (const r of allRoutes) counts[r.guard]++;

// ─── Output ───────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(' Ramex Store — Route Permission Audit (REPORT ONLY — not a CI gate yet)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// Group by guard type for readability
const guardOrder: GuardType[] = [
  'NONE', 'requireRole', 'requireHrPerm', 'requireSupplierPerm', 'requireReportAccess',
  'requireAuth', 'requirePermission',
];

for (const guardType of guardOrder) {
  const routes = allRoutes.filter((r) => r.guard === guardType);
  if (routes.length === 0) continue;

  const header = guardType === 'NONE'
    ? '⚠  NONE (no auth guard at all)'
    : guardType === 'requireRole'
    ? '⚙  requireRole (hardcoded — migrate to requirePermission in Phase 2-3)'
    : guardType === 'requirePermission'
    ? '✓  requirePermission (matrix-enforced)'
    : `⚙  ${guardType} (custom wrapper — migrate to requirePermission in Phase 2)`;

  console.log(`${header}`);
  console.log('─'.repeat(70));
  for (const r of routes) {
    const detail = r.detail ? `  [${r.detail}]` : '';
    console.log(`  ${r.method.padEnd(7)} ${r.path.padEnd(45)} ${r.file}${detail}`);
  }
  console.log();
}

console.log('─'.repeat(70));
console.log('Summary:');
for (const [guard, count] of Object.entries(counts)) {
  if (count === 0) continue;
  const flag = guard === 'NONE' ? ' ⚠' : guard === 'requirePermission' ? ' ✓' : '';
  console.log(`  ${guard.padEnd(25)} ${count}${flag}`);
}
console.log(`  ${'TOTAL'.padEnd(25)} ${allRoutes.length}`);
console.log();

const unmapped = counts['NONE'] + counts['requireRole'] + counts['requireHrPerm'] +
  counts['requireSupplierPerm'] + counts['requireReportAccess'];
console.log(`Matrix coverage: ${counts['requirePermission']}/${allRoutes.length} routes`);
if (unmapped > 0) {
  console.log(`Needs migration: ${unmapped} routes (Phase 2-5 work)\n`);
}
