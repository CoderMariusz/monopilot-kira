// tooling/eslint-rules/scripts/generate-snapshot.mjs
//
// Sanctioned codegen path for the enum-lock guard (T-130).
// Parses packages/rbac/src/permissions.enum.ts and writes the locked member set
// to baselines/permissions.snapshot.json. Run via:
//   pnpm --filter @monopilot/eslint-rules snapshot
//
// Adding/removing a permission is ONLY legal through this script (so the ESLint
// rule's baseline diff clears) plus a PR carrying the `permissions-enum-update` label.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@typescript-eslint/parser';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const ENUM_PATH = resolve(repoRoot, 'packages', 'rbac', 'src', 'permissions.enum.ts');
const OUT_PATH = resolve(here, '..', 'baselines', 'permissions.snapshot.json');

/** Extract { KEY: "value" } from the `Permission` const object expression. */
export function extractMembers(source) {
  const ast = parse(source, { ecmaVersion: 2024, sourceType: 'module', loc: false, range: false });
  const members = {};

  function visitObject(objExpr) {
    for (const prop of objExpr.properties) {
      if (prop.type !== 'Property') continue;
      const key =
        prop.key.type === 'Identifier'
          ? prop.key.name
          : prop.key.type === 'Literal'
            ? String(prop.key.value)
            : null;
      if (!key) continue;
      if (prop.value.type === 'Literal' && typeof prop.value.value === 'string') {
        members[key] = prop.value.value;
      }
    }
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.id.name === 'Permission'
    ) {
      let init = node.init;
      if (init?.type === 'TSAsExpression') init = init.expression;
      if (init?.type === 'ObjectExpression') visitObject(init);
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && v.type) walk(v);
    }
  }

  walk(ast);
  return members;
}

function main() {
  const source = readFileSync(ENUM_PATH, 'utf8');
  const members = extractMembers(source);
  const count = Object.keys(members).length;
  if (count === 0) {
    throw new Error(`No Permission members extracted from ${ENUM_PATH} — refusing to write an empty snapshot.`);
  }
  // Sort keys for a stable, diff-friendly snapshot.
  const sorted = Object.fromEntries(Object.entries(members).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const payload = {
    $comment:
      'LOCKED RBAC permission baseline (T-130). Regenerate ONLY via `pnpm --filter @monopilot/eslint-rules snapshot`. PR must carry the `permissions-enum-update` label.',
    source: 'packages/rbac/src/permissions.enum.ts',
    count,
    members: sorted,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${count} locked permission members → ${OUT_PATH}`);
}

// Run when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
