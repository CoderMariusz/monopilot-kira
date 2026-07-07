import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const WEB_ROOT = resolve(__dirname, '../..');

const SCAN_ROOTS = ['app', 'lib', 'actions', 'components'];

const ASYNC_FN_EXPORT_RE = /^export\s+async\s+function\b/;

/** D1a sweep — these modules must stay async-only exports (deploy-risk regression). */
export const D1A_USE_SERVER_REGRESSION_FILES = [
  'app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts',
  'app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts',
  'app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.ts',
  'app/[locale]/(app)/(modules)/planning/_actions/mrp.ts',
  'app/(npd)/builder/_actions/release-npd-project-to-factory.ts',
  'app/(npd)/builder/_lib/factory-release-status.ts',
  'app/(npd)/fa/actions/search-items.ts',
  'app/(npd)/fa/actions/wip-process-actions.ts',
  'app/[locale]/(app)/(modules)/technical/factory-specs/actions/factory-spec-flow.ts',
] as const;

export type UseServerExportViolation = {
  file: string;
  line: number;
  exportLine: string;
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === 'coverage') continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function isUseServerFile(source: string): boolean {
  const trimmed = source.trimStart();
  return trimmed.startsWith("'use server'") || trimmed.startsWith('"use server"');
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** True when a top-level export line is a runtime value (breaks next build in 'use server'). */
export function isForbiddenUseServerExportLine(exportLine: string): boolean {
  if (ASYNC_FN_EXPORT_RE.test(exportLine)) return false;

  // compile-time only — allowed
  if (/^export\s+type\b/.test(exportLine)) return false;
  if (/^export\s+interface\b/.test(exportLine)) return false;

  if (/^export\s+default\b/.test(exportLine)) return true;
  if (/^export\s+enum\b/.test(exportLine)) return true;
  if (/^export\s+const\b/.test(exportLine)) return true;
  if (/^export\s+class\b/.test(exportLine)) return true;
  if (/^export\s+function\b/.test(exportLine)) return true;

  if (/^export\s+\{/.test(exportLine)) {
    const inner = exportLine.replace(/^export\s+\{/, '').replace(/\}\s*(from\s+.+)?;?\s*$/, '');
    const specs = inner
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return specs.some((spec) => !/^type\s/.test(spec));
  }

  return false;
}

export function scanFileForUseServerExportViolations(
  absolutePath: string,
  root = WEB_ROOT,
): UseServerExportViolation[] {
  const source = readFileSync(absolutePath, 'utf8');
  if (!isUseServerFile(source)) return [];

  const violations: UseServerExportViolation[] = [];
  for (const match of source.matchAll(/^export\s+.+$/gm)) {
    const exportLine = match[0];
    if (!isForbiddenUseServerExportLine(exportLine)) continue;
    violations.push({
      file: relative(root, absolutePath),
      line: lineNumberAt(source, match.index ?? 0),
      exportLine,
    });
  }
  return violations;
}

export function scanUseServerExportViolations(root = WEB_ROOT): UseServerExportViolation[] {
  const files = SCAN_ROOTS.flatMap((scanRoot) => walk(join(root, scanRoot)));
  return files
    .flatMap((absolutePath) => scanFileForUseServerExportViolations(absolutePath, root))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function scanD1aRegressionTargets(root = WEB_ROOT): UseServerExportViolation[] {
  return D1A_USE_SERVER_REGRESSION_FILES.flatMap((relPath) =>
    scanFileForUseServerExportViolations(join(root, relPath), root),
  );
}
