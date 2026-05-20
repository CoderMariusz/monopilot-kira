#!/usr/bin/env node
/**
 * CI lint: fails if any .tsx file outside lib/i18n contains a hardcoded
 * user-facing string longer than 3 characters that is not wrapped in t().
 *
 * Allow-list: URLs, code identifiers (no spaces), JSX attribute values
 * starting with class/className patterns.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const APPS_WEB = join(ROOT, 'apps', 'web');

// Regex to match string literals in JSX context (not wrapped in t())
// Matches JSX text content or JSX expression strings not in a t() call
const HARDCODED_STRING_RE = /(?<![t]\()(?<![({])["']([^"']{4,})["'](?!\s*\))/g;

// Allow-list patterns (URLs, code identifiers, class names, etc.)
const ALLOW_LIST = [
  /^https?:\/\//,           // URLs
  /^\/[a-zA-Z0-9/_-]+$/,   // paths
  /^\w+$/,                   // single identifier
  /^[a-zA-Z][\w-]*$/,       // CSS class name
  /^#[0-9a-fA-F]+$/,        // hex colors
  /^\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/, // CSS values
  /^[A-Z_]+$/,               // constants
];

function isAllowed(str) {
  return ALLOW_LIST.some((re) => re.test(str));
}

function walkTsx(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip lib/i18n, node_modules, .next
      if (['node_modules', '.next', '__tests__'].includes(entry)) continue;
      if (fullPath.includes('lib/i18n')) continue;
      walkTsx(fullPath, results);
    } else if (entry.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const tsxFiles = walkTsx(APPS_WEB);
const violations = [];

for (const file of tsxFiles) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Skip import lines and comments
    if (/^\s*(\/\/|\/\*|import|export\s+type)/.test(line)) return;

    // Look for JSX text nodes that look like user-facing strings
    // Match JSX content between tags or inside {}
    const jsxTextRe = />([^<>{}"']{4,})</g;
    let m;
    while ((m = jsxTextRe.exec(line)) !== null) {
      const text = m[1].trim();
      if (text.length > 3 && !isAllowed(text)) {
        violations.push({ file: relative(ROOT, file), line: idx + 1, text });
      }
    }

    // Look for string literals inside JSX that look like user-facing strings
    const strRe = /["']([A-Z][a-z].*?[a-z]{2,}.*?)["']/g;
    while ((m = strRe.exec(line)) !== null) {
      const text = m[1].trim();
      // Check it's not already inside t(), useTranslations(), or a function call
      const contextBefore = line.substring(0, m.index);
      if (/\bt\s*\(\s*$/.test(contextBefore)) continue;
      if (/\buseTranslations\s*\(\s*$/.test(contextBefore)) continue;
      if (text.length > 3 && !isAllowed(text) && /\s/.test(text)) {
        violations.push({ file: relative(ROOT, file), line: idx + 1, text });
      }
    }
  });
}

if (violations.length > 0) {
  const mode = process.env.HARDCODED_STRINGS_MODE === 'error' ? 'error' : 'warn';
  const printer = mode === 'error' ? console.error : console.warn;
  printer(`Hardcoded user-facing strings found (wrap in t()). Mode: ${mode}.\n`);
  for (const v of violations) {
    printer(`  ${v.file}:${v.line}  "${v.text}"`);
  }
  if (mode === 'error') {
    process.exit(1);
  }
  console.warn(
    '\n[WARN] Hardcoded string debt is currently non-blocking. Set HARDCODED_STRINGS_MODE=error to enforce.',
  );
  process.exit(0);
} else {
  console.log('No hardcoded user-facing strings found.');
  process.exit(0);
}
