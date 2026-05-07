// packages/sync-queue/eslint.config.mjs
// ESLint v9 flat config for @monopilot/sync-queue.
// Extends the shared workspace base and adds browser IndexedDB globals
// which are used throughout this package (offline sync primitive).
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,

  // sync-queue is a browser-targeted package using IndexedDB.
  // Add browser globals for both source and test files.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        // IndexedDB globals (browser API used by idb-keyval and direct access)
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBTransaction: 'readonly',
        IDBObjectStore: 'readonly',
        IDBRequest: 'readonly',
        IDBKeyRange: 'readonly',
        IDBCursor: 'readonly',
        IDBIndex: 'readonly',
        IDBFactory: 'readonly',
        IDBOpenDBRequest: 'readonly',
        IDBVersionChangeEvent: 'readonly',
        // Browser globals used alongside IndexedDB
        navigator: 'readonly',
        window: 'readonly',
        // Web fetch API globals (used by browser flusher)
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
        RequestInit: 'readonly',
        HeadersInit: 'readonly',
        Event: 'readonly',
      },
    },
  },
];
