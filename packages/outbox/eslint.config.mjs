// packages/outbox/eslint.config.mjs
// ESLint v9 flat config for @monopilot/outbox.
// Extends the shared workspace base; no package-specific overrides needed.
//
// Pre-existing deviations (documented, do not fix without T-058 coordination):
//   - src/__tests__/worker.e2e.test.ts: new pg.Pool() — pre-T-058 integration test pattern.
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,

  // Pre-existing: integration tests use new pg.Pool() directly (pre-T-058 pattern).
  // This is tracked debt; do not add new pg.Pool() calls in outbox source files.
  // IMPORTANT: Only the pg.Pool selector is suppressed here. The Reference.* drift
  // gate (T-046) remains active in test files — pg.Pool selector intentionally omitted.
  {
    files: ['src/**/__tests__/**/*.ts', '**/*.e2e.test.ts', '**/*.test.ts'],
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
    },
  },
];
