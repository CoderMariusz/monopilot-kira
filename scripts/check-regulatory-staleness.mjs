#!/usr/bin/env node
/**
 * check-regulatory-staleness.mjs
 *
 * Validates all regulation files in _foundation/regulatory/ (excluding README.md).
 *
 * For each file:
 *   1. Parses YAML front matter (between the first two `---` fences).
 *   2. Asserts all 5 required keys are present:
 *      title, enforcement_date, scope_modules, last_reviewed_at, source_url
 *   3. Asserts last_reviewed_at is not older than 100 days from Date.now().
 *
 * Usage:
 *   node scripts/check-regulatory-staleness.mjs [--dir <path>]
 *
 * Exit 0 — all files valid.
 * Exit 1 — one or more files have missing keys or stale last_reviewed_at.
 *
 * Style: ES module, no external deps beyond node:fs / node:path / node:url.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REQUIRED_KEYS = [
  'title',
  'enforcement_date',
  'scope_modules',
  'last_reviewed_at',
  'source_url',
];

const STALENESS_MS = 100 * 24 * 60 * 60 * 1000; // 100 days

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    [
      'Usage: node scripts/check-regulatory-staleness.mjs [--dir <path>]',
      '',
      'Validates YAML front matter in all regulation .md files under',
      '_foundation/regulatory/ (README.md is excluded).',
      '',
      'Exit 0 — all files valid.',
      'Exit 1 — required key missing or last_reviewed_at older than 100 days.',
    ].join('\n'),
  );
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const dirFlagIndex = process.argv.indexOf('--dir');
const regulatoryRelDir =
  dirFlagIndex !== -1 && process.argv[dirFlagIndex + 1]
    ? process.argv[dirFlagIndex + 1]
    : '_foundation/regulatory';

const regulatoryDir = resolve(projectRoot, regulatoryRelDir);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------
if (!existsSync(regulatoryDir)) {
  console.error(
    `Regulatory staleness check FAILED: directory not found at ${regulatoryDir}`,
  );
  process.exit(1);
}

const files = readdirSync(regulatoryDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => join(regulatoryDir, f))
  .sort();

if (files.length === 0) {
  console.error(
    `Regulatory staleness check FAILED: no regulation .md files found in ${regulatoryDir}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// YAML front matter parser
// Handles the block between the first and second `---` fence.
// Returns an object with string values for each key found.
// ---------------------------------------------------------------------------
/**
 * @param {string} content
 * @returns {Record<string, string | string[]> | null}
 */
function parseFrontMatter(content) {
  // Match the YAML front matter block: starts at position 0 with ---\n
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return null;

  const yamlBlock = match[1];
  const result = {};
  const lines = yamlBlock.split(/\r?\n/);

  let currentKey = null;
  let listItems = null;

  for (const line of lines) {
    // List item under a key
    const listItemMatch = /^  - (.+)$/.exec(line);
    if (listItemMatch && currentKey !== null && listItems !== null) {
      listItems.push(listItemMatch[1].trim());
      result[currentKey] = listItems;
      continue;
    }

    // Key: value line
    const kvMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(line);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === '' || rawValue === null) {
        // Value will come as list items on following lines
        listItems = [];
        result[currentKey] = listItems;
      } else {
        listItems = null;
        // Strip surrounding quotes if present
        result[currentKey] = rawValue.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // Blank line or unrecognised — reset list context
    if (line.trim() === '') {
      currentKey = null;
      listItems = null;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const now = Date.now();
const errors = [];

for (const filePath of files) {
  const relPath = filePath.replace(projectRoot + '/', '');
  const content = readFileSync(filePath, 'utf8');
  const fm = parseFrontMatter(content);

  if (!fm) {
    errors.push(`${relPath}: no YAML front matter found (missing --- fences)`);
    continue;
  }

  // 1. Required keys check
  for (const key of REQUIRED_KEYS) {
    const val = fm[key];
    const missing =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '') ||
      (Array.isArray(val) && val.length === 0);

    if (missing) {
      errors.push(`${relPath}: required key "${key}" is missing or empty`);
    }
  }

  // 2. Staleness check on last_reviewed_at
  const reviewedAt = fm['last_reviewed_at'];
  if (typeof reviewedAt === 'string' && reviewedAt.trim() !== '') {
    const reviewedMs = Date.parse(reviewedAt);
    if (isNaN(reviewedMs)) {
      errors.push(
        `${relPath}: "last_reviewed_at" value "${reviewedAt}" is not a valid ISO 8601 date`,
      );
    } else if (now - reviewedMs > STALENESS_MS) {
      const daysAgo = Math.floor((now - reviewedMs) / (24 * 60 * 60 * 1000));
      errors.push(
        `${relPath}: "last_reviewed_at" is ${daysAgo} days ago (threshold: 100 days) — review required`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(
    `Regulatory staleness check FAILED: ${errors.length} error(s) found.`,
  );
  for (const err of errors) {
    console.error(`  ${err}`);
  }
  process.exit(1);
}

console.log(
  `Regulatory staleness check PASSED: ${files.length} file(s) validated in ${regulatoryRelDir}`,
);
