// apps/web/eslint.config.mjs
// ESLint v9 flat config for the Next.js web application.
// Extends the shared workspace base (T-046, T-025, T-045, T-058 drift gates)
// and adds web-specific globals for Next.js, browser, and service-worker APIs.
//
// Pre-existing deviations (documented, do not fix in T-055):
//   - app/__tests__/i18n.test.ts: __dirname not defined (no-undef in ESM test context)
//   - app/__tests__/sw.test.ts: __dirname not defined, defaultCache unused
//   - app/sw.ts: ServiceWorkerGlobalScope not defined (SW-specific global)
//   - app/_components/RegisterSW.tsx: navigator not defined (client-side component)
//   - app/_components/__tests__/RegisterSW.test.tsx: navigator, global not defined
//   - next.config.mjs: process not defined
//   These are pre-existing; the no-undef rule fires because js.configs.recommended
//   doesn't include browser/node globals by default. Tracked for follow-up.
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,

  // Web-specific additional ignores.
  {
    ignores: ['prototypes/**', '_archive/**', 'coverage/**'],
  },

  // Override: @radix-ui/react-dialog import restriction does NOT apply inside packages/ui.
  // (The base rule blocks it globally; this config is for apps/web which is NOT packages/ui,
  // so the base restriction applies without override.)

  // Add Next.js + browser globals for web source files.
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,mts}'],
    languageOptions: {
      globals: {
        // Node.js / Next.js config globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Browser globals for client components
        navigator: 'readonly',
        window: 'readonly',
        document: 'readonly',
        global: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // Service Worker globals (used in app/sw.ts)
        ServiceWorkerGlobalScope: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
      },
    },
    rules: {
      // Re-apply T-046 RefTables drift rule for web (already in base, kept explicit for clarity).
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Reference\\.[A-Z][A-Za-z]+$/]",
          message:
            "Do not hardcode Reference.* table-name strings. Import RefTables from 'lib/reference' instead.",
        },
        {
          selector: "NewExpression[callee.object.name='pg'][callee.property.name='Pool']",
          message:
            "Do not instantiate new pg.Pool() directly. Use the managed pool from '@monopilot/db' instead.",
        },
      ],
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
          // Content-matching patterns: the previous literal `paths` entries
          // (`./with-org-context`, `../auth/with-org-context`, …) were a NO-OP
          // because the real codebase imports the resolver via
          // `…/lib/auth/with-org-context` at MANY relative depths. Match on the
          // trailing specifier instead so getOwnerPool is fenced regardless of
          // depth. The lib/{auth,scim,platform} override block below RE-PERMITS
          // it for the approved owner-pool trust-chain slices.
          patterns: [
            {
              group: ['**/lib/auth/with-org-context', '**/auth/with-org-context'],
              importNames: ['getOwnerPool'],
              message:
                'getOwnerPool is owner-pool/BYPASSRLS — only apps/web/lib/auth, apps/web/lib/scim, and apps/web/lib/platform may import it.',
            },
          ],
        },
      ],
    },
  },

  // Owner-pool boundary exceptions for the approved backend trust-chain slices.
  {
    files: ['lib/auth/**/*.{js,jsx,ts,tsx,mjs,mts}', 'lib/scim/**/*.{js,jsx,ts,tsx,mjs,mts}', 'lib/platform/**/*.{js,jsx,ts,tsx,mjs,mts}'],
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
          ],
        },
      ],
    },
  },
];
