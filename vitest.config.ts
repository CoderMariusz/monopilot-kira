import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    alias: {
      '@monopilot/*': path.resolve(__dirname, 'packages/*/src')
    }
  }
});
