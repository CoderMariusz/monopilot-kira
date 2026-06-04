import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@monopilot/db/test-utils/test-pool.js',
        replacement: resolve(__dirname, '../db/test-utils/test-pool.ts'),
      },
      {
        find: '@monopilot/db/clients.js',
        replacement: resolve(__dirname, '../db/src/clients.ts'),
      },
      {
        find: '@monopilot/db',
        replacement: resolve(__dirname, '../db/src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 120000,
  },
});
