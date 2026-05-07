import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // fake-indexeddb uses setImmediate internally for async callbacks.
    // Excluding setImmediate from fake timers allows IndexedDB to resolve
    // normally even when vi.useFakeTimers() is active in AC3/AC4 tests.
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
