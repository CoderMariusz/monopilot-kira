import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(__dirname, '../../../..');

export default defineConfig({
  resolve: {
    alias: [
      { find: 'server-only', replacement: path.resolve(root, 'apps/web/__mocks__/server-only.ts') },
      { find: 'next/cache', replacement: path.resolve(__dirname, 'next-cache-stub.ts') },
      { find: /^@monopilot\/db\/(.*)$/, replacement: path.resolve(root, 'packages/db/src/$1') },
      { find: /^@monopilot\/server\/(.*)$/, replacement: path.resolve(root, 'packages/server/src/$1') },
      { find: '@monopilot/gdpr', replacement: path.resolve(root, 'packages/gdpr/src/index.ts') },
      { find: /^@monopilot\/ui\/(.*)$/, replacement: path.resolve(root, 'packages/ui/src/$1') },
      { find: '@monopilot/ui', replacement: path.resolve(root, 'packages/ui/src') },
      { find: '@monopilot/domain', replacement: path.resolve(root, 'packages/domain/src/index.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
    include: ['_meta/plans/2026-08-05-noc/probes/**/*.pg.test.ts'],
  },
});
