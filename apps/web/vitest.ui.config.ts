/**
 * Vitest config for React component tests in apps/web.
 * Uses jsdom environment + @vitejs/plugin-react to support TSX/RTL rendering.
 * Separate from the root vitest.config.ts (which is node-env only, no JSX).
 *
 * Created for T-037 SchemaColumnWizard test suite.
 * Uses vitest v4 (same as the web package) but targets the jsdom environment.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react({
      // Force Babel JSX transform (not oxc) to ensure JSX in test files is
      // processed before rolldown's SSR parse pass.
      babel: {
        plugins: [],
      },
    }),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['../../packages/ui/test/setup.ts'],
    alias: {
      '@monopilot/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
});
