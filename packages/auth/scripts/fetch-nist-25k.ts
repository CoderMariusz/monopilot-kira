import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Reproducible common-password bundle builder for NIST SP 800-63B screening.
 *
 * Source:
 *   SecLists xato-net-10-million-passwords-100000.txt
 *   Repository: https://github.com/danielmiessler/SecLists
 *   Commit: 560414249efa336cf074f078a01245d2132d6875
 *   License: MIT, documented by the upstream repository.
 *
 * The task needs a deterministic top-25k common-password list. This script
 * fetches the pinned source, lowercases entries, removes blanks and duplicates
 * while preserving source order, then writes the first 25,000 unique entries.
 */

const SOURCE_URL =
  'https://raw.githubusercontent.com/danielmiessler/SecLists/560414249efa336cf074f078a01245d2132d6875/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt';
const ENTRY_LIMIT = 25_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultOut = path.resolve(__dirname, '../data/common-passwords-25k.txt');

function parseOutArg(argv: string[]): string {
  const outIndex = argv.indexOf('--out');
  if (outIndex === -1) {
    return defaultOut;
  }

  const out = argv[outIndex + 1];
  if (!out) {
    throw new Error('Missing value for --out');
  }
  return path.resolve(process.cwd(), out);
}

function normalizePasswords(source: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    const password = rawLine.trim().toLowerCase();
    if (!password || seen.has(password)) {
      continue;
    }

    seen.add(password);
    normalized.push(password);

    if (normalized.length === ENTRY_LIMIT) {
      break;
    }
  }

  if (normalized.length < ENTRY_LIMIT) {
    throw new Error(`Expected at least ${ENTRY_LIMIT} unique passwords, got ${normalized.length}`);
  }

  return normalized;
}

async function main(): Promise<void> {
  const out = parseOutArg(process.argv.slice(2));
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status} ${response.statusText}`);
  }

  const passwords = normalizePasswords(await response.text());
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${passwords.join('\n')}\n`, 'utf8');
  console.log(`wrote ${passwords.length} passwords to ${out}`);
}

await main();
