/**
 * Vitest config for React component tests in apps/web.
 * Uses jsdom environment + @vitejs/plugin-react to support TSX/RTL rendering.
 * Separate from the root vitest.config.ts (which is node-env only, no JSX).
 *
 * Created for T-037 SchemaColumnWizard test suite.
 * Uses vitest v4 (same as the web package) but targets the jsdom environment.
 *
 * JSX transform note: vite 8 / rolldown requires JSX to be pre-transformed
 * before ssrTransformScript runs. We use a custom plugin to ensure JSX is
 * transformed via vite's oxc transform before the SSR parse step.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { transformWithOxc } from 'vite';

/**
 * Pre-transform plugin: transforms TSX/JSX files using oxc before the SSR
 * module parse step. Must run with `enforce: 'pre'` so it runs before the
 * vite:react-babel plugin that may skip babel and leave JSX untransformed.
 */
function jsxPreTransformPlugin() {
  const jsxRE = /\.[jt]sx$/;
  return {
    name: 'jsx-pre-transform',
    enforce: 'pre' as const,
    async transform(code: string, id: string) {
      const [filepath] = id.split('?');
      if (!jsxRE.test(filepath)) return null;
      const result = await transformWithOxc(code, id, {
        jsx: { runtime: 'automatic', importSource: 'react' },
      });
      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  plugins: [
    jsxPreTransformPlugin(),
    react(),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  // Inline these in the SSR pipeline so vite (and the react alias below) process
  // them instead of Node's require — otherwise the react-18 peer variant of
  // zustand pulls a second React and crashes Stepper's useStore.
  ssr: {
    noExternal: [
      'zustand',
      'react-hook-form',
      '@hookform/resolvers',
      /@radix-ui\/.*/,
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: 'server-only', replacement: path.resolve(__dirname, '__mocks__/server-only.ts') },
      { find: /^@monopilot\/ui\/(.*)$/, replacement: path.resolve(__dirname, '../../packages/ui/src/$1') },
      { find: /^@monopilot\/db\/(.*)$/, replacement: path.resolve(__dirname, '../../packages/db/src/$1') },
      { find: '@monopilot/ui', replacement: path.resolve(__dirname, '../../packages/ui/src') },
      // Force all packages to use the web app's React 19 so there's only one
      // React instance — even zustand (resolved as a react-18 peer variant) must
      // bind to this single react-19. Resolve the real entry to survive pnpm's
      // virtual-store layout (apps/web/node_modules/react is not a direct symlink).
      { find: /^react$/, replacement: require.resolve('react', { paths: [__dirname] }) },
      { find: /^react-dom$/, replacement: require.resolve('react-dom', { paths: [__dirname] }) },
      { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client', { paths: [__dirname] }) },
      { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime', { paths: [__dirname] }) },
      { find: /^react\/jsx-dev-runtime$/, replacement: require.resolve('react/jsx-dev-runtime', { paths: [__dirname] }) },
      // Force a single react-hook-form instance (react-19 peer variant) so the
      // FormProvider context shared between SchemaColumnWizard and the
      // @monopilot/ui Field/Stepper primitives is the same module. Resolved from
      // node_require to avoid hard-coding the pnpm hash path.
      {
        find: /^react-hook-form$/,
        replacement: require.resolve('react-hook-form', { paths: [__dirname] }),
      },
      // zustand resolved from the web app so we get the react-19 peer variant
      // (a react-18 variant also exists in the store and would re-introduce a
      // second React inside the Stepper's useStore call).
      {
        find: /^zustand$/,
        replacement: require.resolve('zustand', { paths: [__dirname] }),
      },
      {
        find: /^@radix-ui\/react-tabs$/,
        replacement: require.resolve('@radix-ui/react-tabs', { paths: [path.resolve(__dirname, '../../packages/ui')] }),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    // Inline (do NOT externalize) the packages whose own pnpm peer-variant ships
    // a sibling react@18 hardlink. Externalized deps are resolved by Node and
    // bypass the vite `react` alias above, re-introducing a second React and the
    // "Cannot read properties of null (reading 'useCallback')" crash. Inlining
    // routes them through vite so the react-19 alias wins → single React instance.
    server: {
      deps: {
        inline: [
          'zustand',
          'react-hook-form',
          '@hookform/resolvers',
          /@radix-ui\/.*/,
          /@monopilot\/ui/,
        ],
      },
    },
    globals: true,
    include: ['app/**/*.test.tsx', 'components/**/*.test.tsx'],
    setupFiles: ['../../packages/ui/test/setup.ts', './test-setup.ui.ts'],
  },
});
