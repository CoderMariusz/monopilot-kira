// packages/ops/eslint.config.mjs
// Flat config; defers to workspace base (T-055).
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,

  // Node 18+ exposes Request/Response via undici as globals.
  // E2E tests in this package call Next.js route handlers directly, which
  // require these Web API globals. Adding them here avoids per-file directives.
  {
    files: ['src/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
      },
    },
  },
];
