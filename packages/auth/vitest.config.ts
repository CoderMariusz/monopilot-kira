import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
  },
  resolve: {
    alias: [
      {
        // Match exactly 'otplib' (not otplib/dist/... sub-paths)
        // otplib v13 removed the `authenticator` singleton; shim restores it for tests
        find: /^otplib$/,
        replacement: path.resolve(__dirname, 'src/__mocks__/otplib-compat.ts'),
      },
    ],
  },
});
