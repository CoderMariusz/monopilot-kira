// packages/db/eslint.config.mjs
// ESLint v9 flat config for @monopilot/db.
// Enforces that getOwnerConnection is only importable from migration code
// and the migrate script — all other callers must use getAppConnection().
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    // Global rule: block getOwnerConnection import from all source files
    files: ['src/**/*.{js,ts,mjs,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: './clients',
              importNames: ['getOwnerConnection'],
              message:
                'getOwnerConnection is restricted to src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
            },
            {
              name: '../clients',
              importNames: ['getOwnerConnection'],
              message:
                'getOwnerConnection is restricted to src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
            },
            {
              name: '../../src/clients',
              importNames: ['getOwnerConnection'],
              message:
                'getOwnerConnection is restricted to src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
            },
            {
              name: '@monopilot/db/clients',
              importNames: ['getOwnerConnection'],
              message:
                'getOwnerConnection is restricted to src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // Allow getOwnerConnection in migration files and the migrate script
    files: ['src/migrations/**/*.{js,ts}', 'scripts/migrate.ts', 'scripts/migrate.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
