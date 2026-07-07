import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const WRITE_SQL = /\b(insert\s+into|update\s+public\.|delete\s+from\s+public\.)/i;
const CTX_PARAM = /^(ctx|context|orgCtx|rawCtx)$/i;
const CLIENT_ARG = /^(ctx|context|orgCtx|rawCtx|client|queryClient|qc)$/i;

/** Imported or same-file helpers that always perform at least one mutating query. */
const KNOWN_WRITE_HELPERS = new Set([
  'writeAudit',
  'writeLpHistory',
  'writeReceiptCorrectionAudit',
  'writeStockAdjustmentAudit',
  'writeCountLineAdjustmentMetadata',
]);

export type MultiWriteTxStatus =
  | 'atomic-wrapped'
  | 'atomic-caller-tx'
  | 'violation';

export type MultiWriteActionEntry = {
  file: string;
  functionName: string;
  writeCount: number;
  withOrgContextCount: number;
  status: MultiWriteTxStatus;
};

const SCAN_ROOTS = ['app', 'lib/production', 'actions'] as const;

const APPS_WEB_ROOT = path.resolve(__dirname, '../..');

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(ent.name) && !/\.(test|spec)\./.test(ent.name)) acc.push(p);
  }
  return acc;
}

function isScannableActionFile(file: string, src: string, force = false): boolean {
  if (force) return true;
  const isServer = src.includes("'use server'") || src.includes('"use server"');
  const isLibProd = file.includes('lib/production/');
  if (!isServer && !isLibProd) return false;
  return file.includes('/_actions/') || file.includes('/actions/') || isLibProd;
}

function getCalleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
    return expression.name.text;
  }
  return null;
}

function isQueryClientArg(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return CLIENT_ARG.test(expr.text);
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.name.text === 'client'
  ) {
    return CLIENT_ARG.test(expr.expression.text);
  }
  return false;
}

function countDirectSqlWritesInNode(node: ts.Node, sf: ts.SourceFile): number {
  let count = 0;
  function visit(n: ts.Node): void {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'query'
    ) {
      const args = n.arguments[0];
      if (args && (ts.isStringLiteral(args) || ts.isNoSubstitutionTemplateLiteral(args))) {
        if (WRITE_SQL.test(args.text)) count += 1;
      } else if (args && ts.isTemplateExpression(args)) {
        if (WRITE_SQL.test(args.getText(sf))) count += 1;
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return count;
}

function collectSameFileWriteHelpers(sf: ts.SourceFile): Map<string, number> {
  const helpers = new Map<string, number>();

  function record(name: string, node: ts.FunctionLikeDeclaration): void {
    const writes = countDirectSqlWritesInNode(node, sf);
    if (writes > 0) helpers.set(name, writes);
  }

  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      record(node.name.text, node);
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          record(decl.name.getText(sf), decl.initializer);
        }
      }
    }
  }

  return helpers;
}

function countHelperWriteCallsInNode(
  node: ts.Node,
  fileHelpers: Map<string, number>,
): number {
  let count = 0;
  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const calleeName = getCalleeName(n.expression);
      if (calleeName && n.arguments.length > 0 && isQueryClientArg(n.arguments[0])) {
        if (KNOWN_WRITE_HELPERS.has(calleeName)) {
          count += 1;
        } else {
          const helperWrites = fileHelpers.get(calleeName);
          if (helperWrites) count += helperWrites;
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return count;
}

function countWritesInNode(
  node: ts.Node,
  sf: ts.SourceFile,
  fileHelpers: Map<string, number>,
): number {
  return (
    countDirectSqlWritesInNode(node, sf) + countHelperWriteCallsInNode(node, fileHelpers)
  );
}

function countTransactionBoundariesInNode(node: ts.Node): number {
  let count = 0;
  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (n.expression.text === 'withOrgContext' || n.expression.text === 'runWithOrgContext') {
        count += 1;
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return count;
}

function firstParamIsCtx(node: ts.FunctionLikeDeclaration): boolean {
  const first = node.parameters[0];
  if (!first || !ts.isIdentifier(first.name)) return false;
  return CTX_PARAM.test(first.name.text);
}

function classifyFunction(
  file: string,
  functionName: string,
  node: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
  fileHelpers: Map<string, number>,
): MultiWriteActionEntry | null {
  const writeCount = countWritesInNode(node, sf, fileHelpers);
  if (writeCount < 2) return null;

  const withOrgContextCount = countTransactionBoundariesInNode(node);
  const bodyText = node.getText(sf);
  const hasBegin = /\bBEGIN\b/i.test(bodyText);

  let status: MultiWriteTxStatus;
  if (withOrgContextCount >= 1 || hasBegin) {
    status = 'atomic-wrapped';
  } else if (firstParamIsCtx(node)) {
    status = 'atomic-caller-tx';
  } else {
    status = 'violation';
  }

  return {
    file,
    functionName,
    writeCount,
    withOrgContextCount,
    status,
  };
}

export function analyzeFile(
  appsWebRoot: string,
  file: string,
  opts?: { force?: boolean },
): MultiWriteActionEntry[] {
  const abs = path.isAbsolute(file) ? file : path.join(appsWebRoot, file);
  const src = fs.readFileSync(abs, 'utf8');
  if (!isScannableActionFile(file, src, opts?.force)) return [];

  const sf = ts.createSourceFile(
    abs,
    src,
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const relFile = path.relative(appsWebRoot, abs).replace(/\\/g, '/');
  const fileHelpers = collectSameFileWriteHelpers(sf);
  const entries: MultiWriteActionEntry[] = [];

  function inspect(name: string, node: ts.FunctionLikeDeclaration): void {
    const entry = classifyFunction(relFile, name, node, sf, fileHelpers);
    if (entry) entries.push(entry);
  }

  for (const node of sf.statements) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      inspect(node.name.text, node);
    }
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          inspect(decl.name.getText(sf), decl.initializer);
        }
      }
    }
  }

  return entries;
}

/** Static sweep: exported server actions / production services with 2+ dependent writes. */
export function scanMultiWriteActions(appsWebRoot = APPS_WEB_ROOT): MultiWriteActionEntry[] {
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(appsWebRoot, root)));
  return files.flatMap((file) => analyzeFile(appsWebRoot, file));
}

export function formatInventoryTable(entries: MultiWriteActionEntry[]): string {
  const header = '| action | writes | tx status |';
  const sep = '| --- | ---: | --- |';
  const rows = entries
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file) || a.functionName.localeCompare(b.functionName))
    .map((e) => `| \`${e.file}:${e.functionName}\` | ${e.writeCount} | ${e.status} |`);
  return [header, sep, ...rows].join('\n');
}
