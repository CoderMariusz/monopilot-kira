// packages/schema-runtime/eslint.config.mjs
// ESLint v9 flat config for @monopilot/schema-runtime.
// Extends the shared workspace base.
//
// NOTE: packages/schema-runtime/src/compile.ts and src/__tests__/compile.test.ts
// contain pre-existing new pg.Pool() usages (pre-T-058 pattern). These are
// documented pre-existing deviations; the T-058 migration (to use @monopilot/db
// managed pool) is tracked separately and is NOT in scope for T-055.
// The no-restricted-syntax pg.Pool rule is disabled for these files to keep
// root pnpm lint green on a clean repo.
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,

  // Pre-existing deviations in compile.ts and its integration tests:
  //   1. new pg.Pool() — pre-T-058 pattern; migration tracked separately, not in T-055 scope.
  //   2. no-unused-vars in compile.test.ts (duration1) — pre-existing code debt.
  // These overrides keep root pnpm lint green on a clean repo; do not add new violations here.
  // IMPORTANT: Only the pg.Pool selector is suppressed here. The Reference.* drift
  // gate (T-046) remains active in these files — pg.Pool selector intentionally omitted.
  {
    files: ['src/compile.ts', 'src/**/__tests__/**/*.ts', 'src/**/__tests__/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Reference\\.[A-Z][A-Za-z]+$/]",
          message:
            "Do not hardcode Reference.* table-name strings. Import RefTables from 'lib/reference'.",
        },
        // pg.Pool selector intentionally omitted in test override (legacy debt; T-058 will migrate)
      ],
      'no-unused-vars': 'off',
    },
  },
];
