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

/**
 * Custom ESLint rules for MonoPilot web (inline plugin avoids flat-config
 * no-restricted-syntax severity collisions).
 *
 * no-ok-false-in-org-context limitations (best-effort):
 * - Cannot distinguish pre-write (safe) from post-write (dangerous) returns.
 * - Misses helpers called from the withOrgContext callback.
 * - Misses computed/spread `ok` values.
 *
 * Multi-write transaction boundary is enforced in CI by
 * apps/web/tests/multi-write-transaction-contract.test.ts (AST scan).
 * 'use server' export shape is enforced by apps/web/tests/use-server-export-contract.test.ts.
 */
const monopilotPlugin = {
  rules: {
    'no-ok-false-in-org-context': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow return { ok: false } inside withOrgContext callbacks (partial-commit hazard).',
        },
        messages: {
          partialCommit:
            'return {ok:false} inside withOrgContext COMMITS partial writes — throw a module-local Abort instead (see PromoteAbort in promote-to-production.ts)',
        },
        schema: [],
      },
      create(context) {
        function isOkFalseObject(node) {
          if (!node || node.type !== 'ObjectExpression') return false;
          return node.properties.some(
            (prop) =>
              prop.type === 'Property' &&
              !prop.computed &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'ok' &&
              prop.value.type === 'Literal' &&
              prop.value.value === false,
          );
        }

        function isWithOrgContextCallback(fnNode) {
          const parent = fnNode.parent;
          return (
            parent?.type === 'CallExpression' &&
            parent.callee.type === 'Identifier' &&
            parent.callee.name === 'withOrgContext' &&
            parent.arguments[0] === fnNode
          );
        }

        function checkReturnStatement(node) {
          if (!isOkFalseObject(node.argument)) return;
          let current = node;
          while (current) {
            if (
              (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
              isWithOrgContextCallback(current)
            ) {
              context.report({ node, messageId: 'partialCommit' });
              return;
            }
            current = current.parent;
          }
        }

        return { ReturnStatement: checkReturnStatement };
      },
    },
    'no-export-type-in-use-server': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "Disallow non-async exports in 'use server' modules (breaks next build).",
        },
        messages: {
          exportType:
            "'use server' modules may export only async functions — move types/consts to a non-server sibling (local tsc passes; next build fails).",
        },
        schema: [],
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const firstStmt = sourceCode.ast.body[0];
        const isUseServer =
          firstStmt?.type === 'ExpressionStatement' &&
          firstStmt.directive === 'use server';
        if (!isUseServer) return {};

        function reportExport(node) {
          context.report({ node, messageId: 'exportType' });
        }

        function isAsyncFunction(node) {
          return node.async === true;
        }

        return {
          ExportNamedDeclaration(node) {
            // export type { ... } — compile-time only
            if (node.exportKind === 'type') return;

            const decl = node.declaration;
            if (decl) {
              if (decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSTypeAliasDeclaration') {
                return;
              }
              if (decl.type === 'VariableDeclaration') reportExport(node);
              if (decl.type === 'ClassDeclaration') reportExport(node);
              if (decl.type === 'TSEnumDeclaration') reportExport(node);
              if (decl.type === 'FunctionDeclaration' && !isAsyncFunction(decl)) reportExport(node);
              return;
            }

            // export { ... } / export { type A, B } — flag only value re-exports
            if (node.specifiers?.length) {
              const hasValueSpecifier = node.specifiers.some((spec) => spec.exportKind !== 'type');
              if (hasValueSpecifier) reportExport(node);
            }
          },
          ExportDefaultDeclaration(node) {
            reportExport(node);
          },
        };
      },
    },
  },
};

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

  // MonoPilot custom guards (per-rule severity via inline plugin).
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,mts}'],
    plugins: { monopilot: monopilotPlugin },
    rules: {
      'monopilot/no-ok-false-in-org-context': 'warn',
      'monopilot/no-export-type-in-use-server': 'error',
    },
  },
];
