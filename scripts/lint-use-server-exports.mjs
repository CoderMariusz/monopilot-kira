#!/usr/bin/env node
/**
 * CI lint: a module whose FIRST statement is the `'use server'` directive may
 * export ONLY async functions. Next compiles every export of such a module into a
 * callable server-action reference, so any other export is rejected at build time
 * with "A 'use server' file can only export async functions".
 *
 * Why this exists as its own gate: `tsc` and `vitest` both pass on the broken code.
 * The only thing that ever caught it was a full `next build` — twice in eight days:
 *   2026-07-28  units      `export type { X }` without `from` → ReferenceError at runtime
 *   2026-08-05  where-used `export const WHERE_USED_LIMIT = 100` → next build fails
 * The second one blocked every production deploy for a week before anyone noticed.
 *
 * The check is an ALLOW-LIST, not a list of banned forms. Both incidents were a
 * different export form than the one before, so enumerating bad forms only ever
 * catches the incident that already happened.
 *
 * Legal, and deliberately NOT reported (a false alarm here blocks all work):
 *   - `export async function …`            — the entire point of these modules (826 in repo)
 *   - `export type Foo = …`                — SWC erases type aliases before the server-action
 *   - `export interface Foo {…}`             transform runs (641 + 3 in repo, build passes)
 *   - `export type { X } from './y'`       — type-only re-export, also erased (6 in repo)
 *
 * Deliberately STRICTER than `next build` in exactly one spot: `export const f = async () => {}`
 * compiles fine (verified — full `next build` passed with one added on 2026-08-05), but is still
 * reported, because all 826 action exports in this repo are `export async function` and allowing
 * const-bound actions would mean telling `export const X = 100` apart from it by value shape.
 * To permit it, allow a VariableStatement whose sole declarator initialises to an async
 * arrow/function expression — one branch in `illegalExport`.
 *
 * To fix a reported export: move it to a sibling module WITHOUT the directive and
 * import it back. That is already the repo convention — 19 modules keep their consts
 * and types in `_actions/shared.ts` / `_actions/errors.ts`.
 * See .claude/skills/MON-t2-api/SKILL.md → "'use server' export rule".
 */

import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.turbo',
  '.vercel',
  '.pnpm-store',
  'dist',
  'build',
  'coverage',
]);

function walkSource(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue; // broken symlink / vanished during walk
    }
    if (stat.isDirectory()) {
      walkSource(fullPath, results);
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * True only when `'use server'` is a MODULE-LEVEL directive.
 *
 * The directive prologue is the run of leading statements that are nothing but a
 * string literal, so we walk statements from the top and stop at the first one that
 * is not. Reading it off the AST rather than the text is what makes the three known
 * traps free: comments above the directive are not statements, `'use strict'` before
 * it does not hide it, and `'use server'` inside a function body is never in the
 * module's own prologue (182 files in this repo do exactly that and must be ignored).
 */
function hasModuleLevelUseServer(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === 'use server') return true;
  }
  return false;
}

const nameOf = (statement) => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((d) => d.name.getText(d.getSourceFile())).join(', ');
  }
  return statement.name ? statement.name.getText(statement.getSourceFile()) : '';
};

/** Returns a description of the illegal export, or null when the statement is fine. */
function illegalExport(statement) {
  // `export … from …`, `export * …`, `export { … }`
  if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly && statement.moduleSpecifier) return null; // erased by SWC
    if (!statement.moduleSpecifier) {
      return statement.isTypeOnly
        ? 'export type { … } without `from` (still emits a runtime binding)'
        : 'export { … } without `from`';
    }
    return statement.exportClause ? 'export { … } from …' : 'export * from …';
  }

  // `export default <expression>` / `export = …`
  if (ts.isExportAssignment(statement)) return 'export default that is not an async function declaration';

  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
  const has = (kind) => modifiers.some((m) => m.kind === kind);
  if (!has(ts.SyntaxKind.ExportKeyword)) return null; // module-private: not our business

  // Erased before the server-action transform runs.
  if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) return null;

  // The one legal runtime export.
  if (ts.isFunctionDeclaration(statement) && has(ts.SyntaxKind.AsyncKeyword)) return null;

  const name = nameOf(statement);
  const suffix = name ? ` (\`${name}\`)` : '';
  if (ts.isFunctionDeclaration(statement)) return `export function without \`async\`${suffix}`;
  if (ts.isVariableStatement(statement)) {
    const flags = statement.declarationList.flags;
    const keyword = flags & ts.NodeFlags.Const ? 'const' : flags & ts.NodeFlags.Let ? 'let' : 'var';
    return `export ${keyword}${suffix}`;
  }
  if (ts.isClassDeclaration(statement)) return `export class${suffix}`;
  if (ts.isEnumDeclaration(statement)) return `export enum${suffix}`;
  return `export ${ts.SyntaxKind[statement.kind]}${suffix}`;
}

const violations = [];
let moduleCount = 0;

for (const file of walkSource(ROOT)) {
  const content = readFileSync(file, 'utf-8');
  if (!content.includes('use server')) continue; // cheap pre-filter before parsing

  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : undefined,
  );
  if (!hasModuleLevelUseServer(sourceFile)) continue;
  moduleCount++;

  for (const statement of sourceFile.statements) {
    const problem = illegalExport(statement);
    if (!problem) continue;
    violations.push({
      file: relative(ROOT, file),
      line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
      problem,
    });
  }
}

if (violations.length > 0) {
  console.error(
    `A 'use server' module may only export async functions. ${violations.length} illegal export(s) found:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.problem}`);
  }
  console.error(
    '\nThis breaks `next build` (tsc and vitest do NOT catch it). Move the export to a' +
      '\nsibling module without the `use server` directive — e.g. `_actions/shared.ts` —' +
      '\nand import it back. See .claude/skills/MON-t2-api/SKILL.md.',
  );
  process.exit(1);
}

console.log(`No illegal exports in ${moduleCount} 'use server' modules.`);
process.exit(0);
