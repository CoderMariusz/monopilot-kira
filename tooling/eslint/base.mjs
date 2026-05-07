// tooling/eslint/base.mjs
// Shared ESLint v9 flat-config base for all @monopilot packages.
// Each package's eslint.config.mjs imports and spreads this array,
// then appends package-specific overrides.
//
// Rules ported from:
//   T-046: Reference.* literal drift gate (apps/web/eslint.config.mjs)
//   T-025: @radix-ui/react-dialog import restriction (apps/web/eslint.config.mjs)
//   T-045: getOwnerConnection import restriction (packages/db/eslint.config.mjs)
//   T-058: raw new pg.Pool(...) restriction
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
const base = [
  // Global ignores applied to every package that spreads this config.
  {
    ignores: ['dist/**', 'node_modules/**', '.next/**', 'coverage/**'],
  },

  // JS recommended baseline.
  js.configs.recommended,

  // TypeScript + all shared drift rules for all source files.
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2024,
      },
      globals: {
        // Node.js globals available in all monorepo packages.
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      // T-046: drift gate — prevent hardcoded Reference.* string literals.
      // All Reference table names must be imported from @monopilot/reference (RefTables enum).
      //
      // T-058: drift gate — prevent raw new pg.Pool(...) outside packages/db/src/clients.ts.
      // All connection pooling must go through the managed pool in packages/db.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Reference\\.[A-Z][A-Za-z]+$/]",
          message:
            "Do not hardcode Reference.* table-name strings. Import RefTables from '@monopilot/reference' instead.",
        },
        {
          selector: "NewExpression[callee.object.name='pg'][callee.property.name='Pool']",
          message:
            "Do not instantiate new pg.Pool() directly. Use the managed pool from '@monopilot/db' instead.",
        },
      ],

      // T-025: drift gate — prevent direct imports of @radix-ui/react-dialog outside packages/ui.
      // T-045: drift gate — getOwnerConnection must never be imported outside migration paths.
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
          ],
        },
      ],
    },
  },
];

export default base;
