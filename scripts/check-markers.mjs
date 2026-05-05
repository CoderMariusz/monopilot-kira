#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const MARKER_RE = /\[(UNIVERSAL|APEX-CONFIG|EVOLVING|LEGACY-D365)\]/;
const DEFAULT_TARGETS = ['_foundation/decisions/ADR-035-marker-discipline.md'];

const EXECUTIVE_FRONT_MATTER = new Set([
  'executive summary',
  'overview',
  'context',
  'status',
  'decision',
  'consequences',
  'references',
  'changelog',
]);

function usage() {
  return [
    'Usage: node scripts/check-markers.mjs [file-or-directory ...]',
    '',
    'Checks PRD/ADR markdown headings for one of:',
    '  [UNIVERSAL] [APEX-CONFIG] [EVOLVING] [LEGACY-D365]',
    '',
    'With no arguments, scans the current marker-discipline ADR seed; pass PRD/ADR paths to gate additional docs.',
  ].join('\n');
}

function isPrdOrAdrMarkdown(path) {
  if (extname(path) !== '.md') return false;
  const normalized = path.replaceAll('\\', '/');
  const basename = normalized.split('/').pop() ?? '';
  return normalized.includes('/docs/prd/') || basename.includes('PRD') || basename.startsWith('ADR-');
}

function collectMarkdown(path, out = []) {
  if (!existsSync(path)) return out;
  const info = statSync(path);
  if (info.isDirectory()) {
    for (const entry of readdirSync(path)) {
      collectMarkdown(join(path, entry), out);
    }
    return out;
  }
  if (info.isFile() && isPrdOrAdrMarkdown(path)) out.push(path);
  return out;
}

function stripMarker(text) {
  return text.replace(MARKER_RE, '').trim().toLowerCase();
}

function isAllowedUnmarkedHeading(level, text, headingIndex) {
  const normalized = stripMarker(text)
    .replace(/^§[\w.-]+\s+/, '')
    .replace(/[—:-].*$/, '')
    .trim();

  if (level === 1 && headingIndex === 0) return true;
  if (level === 2 && EXECUTIVE_FRONT_MATTER.has(normalized)) return true;
  return false;
}

function checkFile(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const failures = [];
  let headingIndex = 0;

  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) return;

    const level = match[1].length;
    const text = match[2];
    const currentHeadingIndex = headingIndex;
    headingIndex += 1;

    if (MARKER_RE.test(text)) return;
    if (isAllowedUnmarkedHeading(level, text, currentHeadingIndex)) return;

    failures.push({ line: index + 1, heading: text });
  });

  return failures;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage());
  process.exit(0);
}

const roots = process.argv.slice(2);
const scanRoots = roots.length > 0 ? roots : DEFAULT_TARGETS;
const files = scanRoots.flatMap((arg) => collectMarkdown(resolve(process.cwd(), arg))).sort();
if (files.length === 0) {
  console.error(`Marker check failed: no PRD/ADR markdown files found for ${scanRoots.join(', ')}.`);
  process.exit(1);
}
const failures = [];

for (const file of files) {
  for (const failure of checkFile(file)) {
    failures.push({ file, ...failure });
  }
}

if (failures.length > 0) {
  console.error(`Marker check failed: ${failures.length} unmarked heading(s).`);
  for (const failure of failures) {
    console.error(
      `${relative(process.cwd(), failure.file)}:${failure.line}: missing marker on heading "${failure.heading}"`,
    );
  }
  process.exit(1);
}

console.log(`Marker check passed: ${files.length} file(s) checked.`);
