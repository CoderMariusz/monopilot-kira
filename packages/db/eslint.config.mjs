// packages/db/eslint.config.mjs
// ESLint v9 flat config for @monopilot/db.
// Extends the shared workspace base and adds T-045 getOwnerConnection restriction
// with relative-import paths that apply within this package's source tree.
import base from '../../tooling/eslint/base.mjs';

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
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Allow getOwnerConnection in migration files and the migrate script.
  {
    files: ['src/migrations/**/*.{js,ts}', 'scripts/migrate.ts', 'scripts/migrate.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
