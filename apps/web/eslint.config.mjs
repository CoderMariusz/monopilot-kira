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
    rules: {}
  }
];
