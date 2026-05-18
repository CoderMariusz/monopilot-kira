import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
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
