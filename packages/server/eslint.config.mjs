// packages/server/eslint.config.mjs
// ESLint v9 flat config for @monopilot/server.
// Extends the shared workspace base.
//
// Pre-existing deviations (documented, do not fix without T-058 coordination):
//   - src/idempotent.ts: new pg.Pool() — pre-T-058 inline pool creation.
//   - src/__tests__/idempotent.test.ts: new pg.Pool() — pre-T-058 integration test pattern.
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,

  // Pre-existing: server's idempotent utility and its tests create pg.Pool directly
  // (pre-T-058 pattern). T-058 will migrate this to @monopilot/db managed pool.
  // Do not add new pg.Pool() calls in server source files.
  // IMPORTANT: Only the pg.Pool selector is suppressed here. The Reference.* drift
  // gate (T-046) remains active in these files — pg.Pool selector intentionally omitted.
  {
    files: ['src/idempotent.ts', 'src/**/__tests__/**/*.ts', '**/*.test.ts'],
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
