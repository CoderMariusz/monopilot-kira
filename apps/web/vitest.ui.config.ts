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
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^@monopilot\/ui\/(.*)$/, replacement: path.resolve(__dirname, '../../packages/ui/src/$1') },
      { find: /^@monopilot\/db\/(.*)$/, replacement: path.resolve(__dirname, '../../packages/db/src/$1') },
      { find: '@monopilot/ui', replacement: path.resolve(__dirname, '../../packages/ui/src') },
      // Force all packages to use the web app's React 19 so there's only one React
      { find: 'react', replacement: path.resolve(__dirname, 'node_modules/react') },
      { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules/react-dom') },
      // Resolve packages that are in packages/ui/node_modules (pnpm workspace)
      { find: 'react-hook-form', replacement: path.resolve(__dirname, '../../packages/ui/node_modules/react-hook-form') },
      { find: 'zustand', replacement: path.resolve(__dirname, '../../packages/ui/node_modules/zustand') },
      { find: '@radix-ui/react-tabs', replacement: path.resolve(__dirname, '../../packages/ui/node_modules/@radix-ui/react-tabs') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['app/**/*.test.tsx'],
    setupFiles: ['../../packages/ui/test/setup.ts', './test-setup.ui.ts'],
  },
});
