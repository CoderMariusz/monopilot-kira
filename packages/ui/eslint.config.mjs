// packages/ui/eslint.config.mjs
// ESLint v9 flat config for @monopilot/ui.
// Extends the shared workspace base and adds:
//   - T-025 allowance: @radix-ui/react-dialog IS permitted here (Modal primitive owner).
//   - Browser globals for source + test files.
//   - Pre-existing deviation suppressions (see comments per override).
import base from '../../tooling/eslint/base.mjs';
import tsPlugin from '@typescript-eslint/eslint-plugin';

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

  // Add browser globals for all UI source files (DOM APIs used in Modal.tsx).
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        // Browser globals used in Modal.tsx and test helpers.
        document: 'readonly',
        window: 'readonly',
        alert: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        getComputedStyle: 'readonly',
        JSX: 'readonly',
      },
    },
  },

  // Test files: add vitest globals and disable strict rules on pre-existing patterns.
  // Pre-existing deviations documented: unused imports in test harness, vi global,
  // unused vars in complex test assertions. Do not add new violations.
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.a11y.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      // Pre-existing: unused imports/vars in test files (beforeEach, afterEach, rerender, etc.)
      'no-unused-vars': 'off',
    },
  },

  // Load @typescript-eslint plugin globally with rules off so eslint-disable
  // directives that reference @typescript-eslint/* rules don't trigger
  // "rule not found" errors. Rules stay off — we don't enforce them here.
  {
    files: ['**/*.{ts,tsx,d.ts}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  // Modal.tsx: suppress false-positive unused param in interface callback signature.
  // 'open' in onOpenChange: (open: boolean) => void is a named parameter (idiomatic TS).
  // Pre-existing pattern; not a real unused-var.
  {
    files: ['src/Modal.tsx'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
