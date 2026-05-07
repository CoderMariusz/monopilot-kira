#!/usr/bin/env node
/**
 * check-domain-glossary.mjs
 *
 * Verifies that _foundation/glossary/domain-terms.md contains every required
 * canonical_term row as defined by T-048 / §W0-v4.3 Wave0 domain lock.
 *
 * Usage:
 *   node scripts/check-domain-glossary.mjs [--glossary <path>]
 *
 * Exit 0 — all required terms present.
 * Exit 1 — one or more required terms missing; prints which ones.
 *
 * Style: ES module, no external deps beyond node:fs and node:path.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Required canonical_term values (case-sensitive, must appear in the first
// pipe-delimited column of a table row in the glossary).
// 13 required rows per T-048 implementation contract.
// ---------------------------------------------------------------------------
const REQUIRED_TERMS = [
  'org_id',
  'tenant_id',
  'FG / finished_good',
  'FA',
  'fg.*',
  'fa.*',
  'NPD Project',
  'Brief → NPD Project',
  'convertBriefToFa',
  'factory_spec',
  'internal_product_spec',
  'shared_bom',
  'D365 posture',
];

function usage() {
  return [
    'Usage: node scripts/check-domain-glossary.mjs [--glossary <path>]',
    '',
    'Reads _foundation/glossary/domain-terms.md (or the path supplied via --glossary)',
    'and asserts that every required canonical_term row is present.',
    '',
    'Exit 0 — all required terms present.',
    'Exit 1 — one or more required terms missing.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage());
  process.exit(0);
}

const glossaryFlagIndex = process.argv.indexOf('--glossary');
const defaultGlossaryPath = '_foundation/glossary/domain-terms.md';
const glossaryRelPath =
  glossaryFlagIndex !== -1 && process.argv[glossaryFlagIndex + 1]
    ? process.argv[glossaryFlagIndex + 1]
    : defaultGlossaryPath;

const glossaryPath = resolve(process.cwd(), glossaryRelPath);

// ---------------------------------------------------------------------------
// File existence check
// ---------------------------------------------------------------------------
if (!existsSync(glossaryPath)) {
  console.error(`Domain glossary check FAILED: glossary file not found at ${glossaryPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse glossary: extract canonical_term values from pipe-table rows.
//
// Table format:
//   | canonical_term | legacy_alias | definition | ... |
//
// We skip the header row and separator row; every other pipe-row has its first
// cell trimmed and collected as a found term.
// ---------------------------------------------------------------------------
const content = readFileSync(glossaryPath, 'utf8');
const lines = content.split(/\r?\n/);

/** @type {Set<string>} */
const foundTerms = new Set();

for (const line of lines) {
  const trimmed = line.trim();
  // Must be a pipe-table row (starts and ends with '|')
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;

  const cells = trimmed
    .slice(1, -1)          // strip leading and trailing '|'
    .split('|')
    .map((c) => c.trim());

  const firstCell = cells[0] ?? '';

  // Skip header row and separator rows (e.g. |---|---|...)
  if (firstCell === '' || /^[-:]+$/.test(firstCell) || firstCell === 'canonical_term') continue;

  // Strip all backticks (e.g. `FG` / `finished_good` → FG / finished_good)
  const term = firstCell.replace(/`/g, '');
  foundTerms.add(term);
}

// ---------------------------------------------------------------------------
// Assertion
// ---------------------------------------------------------------------------
const missing = REQUIRED_TERMS.filter((t) => !foundTerms.has(t));

if (missing.length > 0) {
  console.error(
    `Domain glossary check FAILED: ${missing.length} required term(s) missing from ${glossaryRelPath}`,
  );
  for (const term of missing) {
    console.error(`  MISSING: "${term}"`);
  }
  process.exit(1);
}

console.log(
  `Domain glossary check PASSED: all ${REQUIRED_TERMS.length} required term(s) present in ${glossaryRelPath}`,
);
