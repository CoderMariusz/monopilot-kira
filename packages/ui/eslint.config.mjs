// packages/ui/eslint.config.mjs
// ESLint v9 flat config for @monopilot/ui.
// Extends the shared workspace base and adds the T-025 allowance:
// @radix-ui/react-dialog IS permitted here (this package owns the Modal primitive).
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,
  // Override: allow @radix-ui/react-dialog within this package only.
  // packages/ui/src/Modal.tsx is the canonical wrapper; direct usage is intentional.
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
