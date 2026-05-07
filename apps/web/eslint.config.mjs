import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules', '.next', 'dist', 'coverage', 'prototypes', '_archive']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2024,
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly'
      }
    },
    rules: {
      // T-046: drift gate — prevent hardcoded Reference.* string literals outside lib/reference/**.
      // All Reference table names must be imported from lib/reference (RefTables enum).
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Reference\\.[A-Z][A-Za-z]+$/]",
          message:
            "Do not hardcode Reference.* table-name strings. Import RefTables from 'lib/reference' instead.",
        },
      ],
    }
  }
];
