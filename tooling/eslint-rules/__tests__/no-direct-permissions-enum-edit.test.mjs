// tooling/eslint-rules/__tests__/no-direct-permissions-enum-edit.test.mjs
//
// T-130 — RuleTester coverage for the enum-lock guard.
//
// Hermetic synthetic fixtures use a fixture baseline (3-segment values) via the
// `snapshotPath` option, PLUS an integration check that the rule passes clean
// against the REAL packages/rbac/src/permissions.enum.ts under the REAL committed
// snapshot, and FIRES when a locked member is hand-removed.
import { describe, it, expect } from 'vitest';
import { RuleTester, Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import rule from '../rules/no-direct-permissions-enum-edit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const realEnumPath = resolve(repoRoot, 'packages', 'rbac', 'src', 'permissions.enum.ts');
const realSnapshotPath = resolve(here, '..', 'baselines', 'permissions.snapshot.json');

// A tiny locked fixture baseline (clean 3-segment values) for the synthetic fixtures.
const FIXTURE_BASELINE = {
  members: { ORG_ACCESS_ADMIN: 'org.access.admin', SETTINGS_REF_EDIT: 'settings.ref.edit' },
};
const fixtureDir = mkdtempSync(join(tmpdir(), 'enum-lock-'));
const fixtureSnapshotPath = join(fixtureDir, 'permissions.snapshot.json');
writeFileSync(fixtureSnapshotPath, JSON.stringify(FIXTURE_BASELINE));

// The rule only runs on files named *permissions.enum.*; RuleTester needs a matching filename.
const FILENAME = 'permissions.enum.ts';
const opts = [{ snapshotPath: fixtureSnapshotPath }];

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2024, sourceType: 'module' },
});

const GOOD = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  SETTINGS_REF_EDIT: 'settings.ref.edit',
} as const;
export const ALL_CORE_PERMISSIONS = [
  Permission.ORG_ACCESS_ADMIN,
  Permission.SETTINGS_REF_EDIT,
] as const;
`;

const GOOD_WITH_ADD = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  SETTINGS_REF_EDIT: 'settings.ref.edit',
  NEW_THING_DO: 'new.thing.do',
} as const;
`;

const BAD_REGEX = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  SETTINGS_REF_EDIT: 'settings.ref.edit',
  BADKEY: 'Not-Valid',
} as const;
`;

const BAD_REMOVAL = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
} as const;
`;

const BAD_MUTATION = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  SETTINGS_REF_EDIT: 'settings.ref.renamed',
} as const;
`;

const BAD_ORPHAN_ARRAY = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  SETTINGS_REF_EDIT: 'settings.ref.edit',
} as const;
export const ALL_CORE_PERMISSIONS = [
  Permission.ORG_ACCESS_ADMIN,
  Permission.SETTINGS_REF_EDIT,
  Permission.GHOST_NOT_DEFINED,
] as const;
`;

const MUTATION_WITH_ESCAPE_HATCH = `
export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  SETTINGS_REF_EDIT: 'settings.ref.renamed', // enum-lock:allow
} as const;
`;

// RuleTester.run registers its own describe/it via the detected test framework,
// so it must be called at the top level (not nested inside an `it`).
ruleTester.run('no-direct-permissions-enum-edit', rule, {
  valid: [
    { filename: FILENAME, code: GOOD, options: opts },
    { filename: FILENAME, code: GOOD_WITH_ADD, options: opts },
    // Wrong filename → rule is a no-op even with garbage content.
    { filename: 'some-other-file.ts', code: BAD_REMOVAL, options: opts },
    // Escape hatch suppresses both the illegal-mutation and regex report on that member.
    { filename: FILENAME, code: MUTATION_WITH_ESCAPE_HATCH, options: opts },
  ],
  invalid: [
    {
      filename: FILENAME,
      code: BAD_REGEX,
      options: opts,
      errors: [{ messageId: 'permissions-enum-regex-violation' }],
    },
    {
      filename: FILENAME,
      code: BAD_REMOVAL,
      options: opts,
      errors: [{ messageId: 'permissions-enum-illegal-removal' }],
    },
    {
      filename: FILENAME,
      code: BAD_MUTATION,
      options: opts,
      // value changed from baseline → illegal-removal; value still 3-segment so no regex error.
      errors: [{ messageId: 'permissions-enum-illegal-removal' }],
    },
    {
      filename: FILENAME,
      code: BAD_ORPHAN_ARRAY,
      options: opts,
      errors: [{ messageId: 'permissions-enum-orphan-array' }],
    },
  ],
});

function lintRealFile(code) {
  const linter = new Linter();
  return linter.verify(
    code,
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tsParser, ecmaVersion: 2024, sourceType: 'module' },
      plugins: { local: { rules: { 'enum-lock': rule } } },
      rules: { 'local/enum-lock': ['error', { snapshotPath: realSnapshotPath }] },
    },
    { filename: FILENAME },
  );
}

describe('real permissions.enum.ts under committed snapshot', () => {
  it('produces ZERO lint errors against the unmodified enum file', () => {
    const code = readFileSync(realEnumPath, 'utf8');
    const messages = lintRealFile(code);
    expect(messages, JSON.stringify(messages, null, 2)).toEqual([]);
  });

  it('fires illegal-removal when a locked member is deleted from the real file', () => {
    const code = readFileSync(realEnumPath, 'utf8');
    const mutated = code.replace(/^\s*AUDIT_READ:\s*'audit\.read',\s*$/m, '');
    expect(mutated).not.toEqual(code);
    const messages = lintRealFile(mutated);
    expect(messages.some((m) => m.messageId === 'permissions-enum-illegal-removal')).toBe(true);
  });
});
