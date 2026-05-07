// packages/rbac/eslint.config.mjs
// ESLint v9 flat config for @monopilot/rbac.
// Extends the shared workspace base (T-055).
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,
  {
    files: ['src/**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Reference\\.[A-Z][A-Za-z]+$/]",
          message:
            "Do not hardcode Reference.* table-name strings. Import RefTables from 'lib/reference'.",
        },
        {
          selector: "NewExpression[callee.name='Pool']",
          message:
            "Use getAppConnection() from @monopilot/db/test-utils instead of raw pg.Pool. See T-055/T-058.",
        },
      ],
    },
  },
];
