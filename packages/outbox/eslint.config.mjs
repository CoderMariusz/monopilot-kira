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
  {
    files: ['src/**/__tests__/**/*.ts', '**/*.e2e.test.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
