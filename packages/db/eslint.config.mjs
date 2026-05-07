// packages/db/eslint.config.mjs
// ESLint v9 flat config for @monopilot/db.
// Extends the shared workspace base and adds T-045 getOwnerConnection restriction
// with relative-import paths that apply within this package's source tree.
//
// Pre-existing deviations (documented, do not fix without T-058 coordination):
//   - __tests__/**/*.ts, src/__tests__/**/*.ts: new pg.Pool() — integration tests use
//     direct pool connections; migration to managed pool tracked in T-058.
//   - schema/tenant-migrations.ts: eslint-disable-next-line @typescript-eslint/no-explicit-any
//     comment references the plugin without it being loaded; suppressed in schema files.
import base from '../../tooling/eslint/base.mjs';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  ...base,

  // T-045 drift gate: getOwnerConnection must never be imported outside migrations/scripts.
  // This extends the base rule (which gates the @monopilot/db named import) with
  // relative-path variants used internally within packages/db itself.
  {
    files: ['src/**/*.{js,ts,mjs,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@radix-ui/react-dialog',
              message:
                'Import Modal from @monopilot/ui instead of using @radix-ui/react-dialog directly.',
            },
            {
              name: '@monopilot/db',
              importNames: ['getOwnerConnection'],
              message:
                'getOwnerConnection is restricted to packages/db migration paths. Use getAppConnection() instead.',
            },
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

  // Allow getOwnerConnection in migration files and the migrate script.
  {
    files: ['src/migrations/**/*.{js,ts}', 'scripts/migrate.ts', 'scripts/migrate.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Pre-existing: db integration tests create pg.Pool directly (pre-T-058 pattern).
  // T-058 will migrate these to use the managed pool. Do not add new pg.Pool() calls here.
  {
    files: [
      '__tests__/**/*.ts',
      'src/__tests__/**/*.ts',
      '**/*.integration.test.ts',
      '**/*.test.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // schema/tenant-migrations.ts contains an eslint-disable comment referencing
  // @typescript-eslint/no-explicit-any; load the plugin (off) to suppress "rule not found".
  {
    files: ['schema/**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
