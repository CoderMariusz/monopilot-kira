import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../..');

const PERMISSION_HELPER =
  /hasPermission|hasAnyPermission|requirePermission|requireAnyPermission|checkPermission|hasWarehousePermission|hasPilotPermission|hasNpdPermission|hasHandoffPermission|hasReportingPermission/;

const PERMISSION_LITERAL = /['"]([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)['"]/g;

const SERVER_PATH_MARKERS = ['/app/api/', '/actions/', '_actions', '/lib/', 'middleware.ts'];

const SKIP_SEGMENTS = [
  `${join('node_modules')}`,
  `${join('__tests__')}`,
  '.next',
  'e2e',
  'parity-evidence',
];

const SKIP_FILE_PATTERNS = [
  /\.test\.[cm]?tsx?$/,
  /\.spec\.[cm]?tsx?$/,
  /\.client\.tsx$/,
  /page\.tsx$/,
  /layout\.tsx$/,
];

/** UI-only affordance gates — excluded from server-enforcement drift (NN-SET-4). */
export const ENFORCED_PERMISSION_UI_ONLY_EXCLUSIONS = new Set([
  'settings.users.create',
  'settings.users.view',
  'settings.roles.assign',
  'npd.production.write',
  'npd.costing',
  'npd.brief.read',
  'npd.fa.read',
  'npd.artwork.read',
  'org.access.admin',
]);

function shouldSkipFile(path: string): boolean {
  if (SKIP_SEGMENTS.some((segment) => path.includes(segment))) return true;
  return SKIP_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

function isServerEnforcementFile(path: string): boolean {
  if (!path.endsWith('.ts') && !path.endsWith('.tsx')) return false;
  if (shouldSkipFile(path)) return false;
  return SERVER_PATH_MARKERS.some((marker) => path.includes(marker));
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (SKIP_SEGMENTS.some((segment) => fullPath.includes(segment))) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (isServerEnforcementFile(fullPath)) files.push(fullPath);
  }
  return files;
}

function extractConstPermissionMap(source: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const singleConst = /const\s+([A-Z0-9_]+)\s*=\s*['"]([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)['"]/g;
  for (const match of source.matchAll(singleConst)) {
    map.set(match[1]!, [match[2]!]);
  }

  const arrayConst =
    /const\s+([A-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*as\s+const/g;
  for (const match of source.matchAll(arrayConst)) {
    const perms: string[] = [];
    for (const literal of match[2]!.matchAll(PERMISSION_LITERAL)) {
      perms.push(literal[1]!);
    }
    if (perms.length > 0) map.set(match[1]!, perms);
  }

  return map;
}

function resolveIdentifierPermissions(identifier: string, constMap: Map<string, string[]>): string[] {
  const direct = constMap.get(identifier);
  if (direct) return direct;
  if (identifier.startsWith('...')) {
    const spreadName = identifier.slice(3);
    return constMap.get(spreadName) ?? [];
  }
  return [];
}

function extractPermissionsFromSource(source: string, catalog: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  const constMap = extractConstPermissionMap(source);
  const lines = source.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!PERMISSION_HELPER.test(line)) continue;

    const block = lines.slice(index, Math.min(index + 8, lines.length)).join('\n');
    for (const match of block.matchAll(PERMISSION_LITERAL)) {
      const permission = match[1]!;
      if (catalog.has(permission)) found.add(permission);
    }

    const spreadArgs = block.matchAll(/\[\.\.\.([A-Z0-9_]+)(?:,\s*\.\.\.([A-Z0-9_]+))?\]/g);
    for (const spreadMatch of spreadArgs) {
      for (const identifier of [spreadMatch[1], spreadMatch[2]].filter(Boolean) as string[]) {
        for (const permission of resolveIdentifierPermissions(identifier, constMap)) {
          if (catalog.has(permission)) found.add(permission);
        }
      }
    }

    const identifierArgs = block.matchAll(
      /(?:hasPermission|hasAnyPermission|requirePermission|requireAnyPermission|checkPermission|hasWarehousePermission|hasPilotPermission|hasNpdPermission|hasHandoffPermission|hasReportingPermission)\([^,]+,\s*([A-Z0-9_]+)\b/g,
    );
    for (const identifierMatch of identifierArgs) {
      for (const permission of resolveIdentifierPermissions(identifierMatch[1]!, constMap)) {
        if (catalog.has(permission)) found.add(permission);
      }
    }
  }

  return found;
}

export function collectServerEnforcedCatalogPermissions(catalog: readonly string[]): Set<string> {
  const catalogSet = new Set(catalog);
  const roots = [join(REPO_ROOT, 'apps', 'web'), join(REPO_ROOT, 'packages')];
  const collected = new Set<string>();

  for (const root of roots) {
    for (const filePath of walk(root)) {
      const source = readFileSync(filePath, 'utf8');
      for (const permission of extractPermissionsFromSource(source, catalogSet)) {
        if (!ENFORCED_PERMISSION_UI_ONLY_EXCLUSIONS.has(permission)) {
          collected.add(permission);
        }
      }
    }
  }

  return collected;
}

export function diffEnforcedPermissions(
  enforcedList: readonly string[],
  catalog: readonly string[],
): { missingFromEnforcedList: string[]; staleOnEnforcedList: string[] } {
  const scanned = collectServerEnforcedCatalogPermissions(catalog);
  const enforced = new Set(enforcedList);

  const missingFromEnforcedList = [...scanned].filter((permission) => !enforced.has(permission)).sort();
  const staleOnEnforcedList = [...enforced].filter((permission) => !scanned.has(permission)).sort();

  return { missingFromEnforcedList, staleOnEnforcedList };
}

export function relativeRepoPath(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath);
}
