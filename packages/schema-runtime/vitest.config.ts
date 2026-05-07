import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@monopilot/reference': path.resolve(__dirname, '../../lib/reference/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
  },
});
