// packages/db/.eslintrc.cjs
// ESLint config for @monopilot/db — enforces that getOwnerConnection is only
// importable from migration code and the migrate script.
'use strict';

module.exports = {
  root: true,
  rules: {
    // Block import of getOwnerConnection from all files except migrations/** and scripts/migrate.ts
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: './src/clients',
            importNames: ['getOwnerConnection'],
            message:
              'getOwnerConnection is restricted to packages/db/src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
          },
          {
            name: '../src/clients',
            importNames: ['getOwnerConnection'],
            message:
              'getOwnerConnection is restricted to packages/db/src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
          },
          {
            name: '@monopilot/db/clients',
            importNames: ['getOwnerConnection'],
            message:
              'getOwnerConnection is restricted to packages/db/src/migrations/** and scripts/migrate.ts. Use getAppConnection() instead.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Allow getOwnerConnection only in migration files and the migrate script
      files: ['src/migrations/**', 'scripts/migrate.ts', 'scripts/migrate.js'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
