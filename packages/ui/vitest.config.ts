import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      // Use local class names as-is so tests can assert on class names like
      // 'summary-row--changed' without hash suffixes.
      generateScopedName: '[local]',
    },
  },
  define: {
    // Ensure React development builds are used in tests (enables act() support)
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
