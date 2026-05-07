// packages/db/eslint.config.mjs
// ESLint v9 flat config for @monopilot/db.
// Enforces that getOwnerConnection is only importable from migration code
// and the migrate script — all other callers must use getAppConnection().
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    // Global rule: block getOwnerConnection import from all source files
    files: ['src/**/*.{js,ts,mjs,mts}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2024,
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // T-045 drift gate: getOwnerConnection must never be imported outside migrations/scripts.
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
      // Declare @typescript-eslint rules as off so eslint-disable comments in
      // pre-existing source files don't trigger "unknown rule" errors.
      '@typescript-eslint/no-explicit-any': 'off',
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
