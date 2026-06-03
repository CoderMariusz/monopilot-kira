import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: 'server-only', replacement: path.resolve(__dirname, 'apps/web/__mocks__/server-only.ts') },
      { find: /^@monopilot\/db\/(.*)$/, replacement: path.resolve(__dirname, 'packages/db/src/$1') },
      { find: /^@monopilot\/ui\/(.*)$/, replacement: path.resolve(__dirname, 'packages/ui/src/$1') },
      { find: '@monopilot/ui', replacement: path.resolve(__dirname, 'packages/ui/src') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
  }
});
