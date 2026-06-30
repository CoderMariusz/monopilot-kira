/**
 * IndexedDB sync queue primitive for offline mutations (T-043).
 * Uses raw IndexedDB with onversionchange handling so test teardown
 * (indexedDB.deleteDatabase) can close the connection cleanly.
 * Mutations are keyed by `mut:${transaction_id}` for O(1) dedup.
 */

export interface Mutation {
  transaction_id: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  body: unknown;
  created_at: string;
}

const DB_NAME = 'sync-queue';
const STORE_NAME = 'mutations';
const DB_VERSION = 1;

/** Cached open connection — reset to null on versionchange / close. */
let _dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      // Close connection when another tab/caller requests a version change
      // (also fired before deleteDatabase succeeds — lets tests tear down cleanly).
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
      };

      db.onclose = () => {
        _dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      _dbPromise = null;
      reject(request.error);
    };
  });

  return _dbPromise;
}

/**
 * Enqueue a mutation for offline persistence.
 * Idempotent: if a mutation with the same transaction_id already exists,
 * the existing entry is kept and the new one is ignored (R14 dedup contract).
 */
export async function enqueue(mutation: Mutation): Promise<void> {
  const db = await getDB();
  const key = `mut:${mutation.transaction_id}`;

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const getReq = store.get(key);

    getReq.onsuccess = () => {
      if (getReq.result !== undefined) {
        // Already present — keep first entry, no-op (idempotent)
        resolve();
        return;
      }
      const putReq = store.put(mutation, key);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * List all pending mutations in FIFO order (sorted by created_at ASC).
 */
export async function listPending(): Promise<Mutation[]> {
  const db = await getDB();

  return new Promise<Mutation[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const mutations = (request.result as Mutation[]).sort((a, b) => {
        if (a.created_at < b.created_at) return -1;
        if (a.created_at > b.created_at) return 1;
        return 0;
      });
      resolve(mutations);
    };

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove a mutation from the queue by transaction_id.
 * Idempotent: removing a non-existent transaction_id is a no-op.
 */
export async function remove(transaction_id: string): Promise<void> {
  const db = await getDB();
  const key = `mut:${transaction_id}`;

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}
