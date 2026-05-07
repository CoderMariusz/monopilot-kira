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

// Monotonic counter state for UUID v7 (RFC 9562 §6.2 Method 1).
let _v7LastMs = 0;
let _v7Seq = 0; // 31-bit monotonic counter

/**
 * Generate a UUID v7 transaction ID for client-side mutation tracking.
 * Returns a 32-character lowercase hex string (UUID v7 without hyphens)
 * that preserves time-ordered lexicographic sort (monotonic counter).
 *
 * Implementation follows RFC 9562 §5.7 using globalThis.crypto.getRandomValues
 * so it works in both browser and jsdom test environments.
 */
export function generateTransactionId(): string {
  const ms = Date.now();

  // Advance monotonic sequence counter when within the same millisecond.
  if (ms > _v7LastMs) {
    _v7LastMs = ms;
    // Re-randomize the 31-bit seq on each new ms tick.
    const rand = new Uint32Array(1);
    globalThis.crypto.getRandomValues(rand);
    _v7Seq = rand[0] & 0x7fffffff;
  } else {
    // Same ms — increment to ensure strict monotonicity.
    _v7Seq = (_v7Seq + 1) & 0x7fffffff;
    if (_v7Seq === 0) {
      // Counter wrapped — advance the logical clock.
      _v7LastMs++;
    }
  }

  // 16 random bytes for the remaining bits.
  const rand = new Uint8Array(16);
  globalThis.crypto.getRandomValues(rand);

  // Layout per RFC 9562 §5.7:
  //  Bits  0-47: unix_ts_ms (48 bits)
  //  Bits 48-51: version = 0x7
  //  Bits 52-63: seq_hi (12 bits, upper 12 of 31-bit seq)
  //  Bits 64-65: variant = 0b10
  //  Bits 66-79: seq_lo (14 bits, lower 14 of 31-bit seq + extra bit from seq)  — but we use 19 bits low here
  //  Bits 80-127: random

  const seqHi = (_v7Seq >>> 19) & 0xfff;   // top 12 bits of 31-bit seq
  const seqLo = _v7Seq & 0x7ffff;          // bottom 19 bits of 31-bit seq

  // Build the 16-byte UUID directly.
  const b = new Uint8Array(16);

  // [0..5] — 48-bit timestamp ms
  const hi = Math.floor(ms / 0x100000000);
  const lo = ms >>> 0;
  b[0] = (hi >>> 8) & 0xff;
  b[1] = hi & 0xff;
  b[2] = (lo >>> 24) & 0xff;
  b[3] = (lo >>> 16) & 0xff;
  b[4] = (lo >>> 8) & 0xff;
  b[5] = lo & 0xff;

  // [6] — version (4 bits = 0x7) | seq_hi[11:8]
  b[6] = 0x70 | ((seqHi >>> 8) & 0x0f);

  // [7] — seq_hi[7:0]
  b[7] = seqHi & 0xff;

  // [8] — variant (2 bits = 0b10) | seq_lo[18:13] (6 bits)
  b[8] = 0x80 | ((seqLo >>> 13) & 0x3f);

  // [9] — seq_lo[12:5] (8 bits)
  b[9] = (seqLo >>> 5) & 0xff;

  // [10] — seq_lo[4:0] (5 bits) | rand[0..2] (3 bits)
  b[10] = ((seqLo & 0x1f) << 3) | (rand[10] & 0x07);

  // [11..15] — random
  b[11] = rand[11];
  b[12] = rand[12];
  b[13] = rand[13];
  b[14] = rand[14];
  b[15] = rand[15];

  // Encode as 32 lowercase hex chars (UUID v7 without hyphens).
  return Array.from(b).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
