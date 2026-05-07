/**
 * IndexedDB sync queue primitive for offline mutations (T-043).
 * Uses idb-keyval as a thin IndexedDB wrapper.
 * Mutations are keyed by `mut:${transaction_id}` for O(1) dedup.
 */

import { get, set, del, entries } from 'idb-keyval';
import { v7 as uuidv7 } from 'uuid';

export interface Mutation {
  transaction_id: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  body: unknown;
  created_at: string;
}

/**
 * Enqueue a mutation for offline persistence.
 * Idempotent: if a mutation with the same transaction_id already exists,
 * the existing entry is kept and the new one is ignored (R14 dedup contract).
 */
export async function enqueue(mutation: Mutation): Promise<void> {
  const key = `mut:${mutation.transaction_id}`;
  const existing = await get(key);
  if (existing !== undefined) {
    // Already present — keep the first entry (idempotent no-op)
    return;
  }
  await set(key, mutation);
}

/**
 * List all pending mutations in FIFO order (sorted by created_at ASC).
 */
export async function listPending(): Promise<Mutation[]> {
  const all = await entries<string, Mutation>();
  const mutations = all
    .filter(([key]) => (key as string).startsWith('mut:'))
    .map(([, value]) => value);

  return mutations.sort((a, b) => {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    return 0;
  });
}

/**
 * Remove a mutation from the queue by transaction_id.
 * Idempotent: removing a non-existent transaction_id is a no-op.
 */
export async function remove(transaction_id: string): Promise<void> {
  await del(`mut:${transaction_id}`);
}

/**
 * Generate a UUID v7 transaction ID for client-side mutation tracking.
 * Returns a 32-character lowercase hex string (UUID v7 without hyphens)
 * that preserves time-ordered lexicographic sort (monotonic counter).
 */
export function generateTransactionId(): string {
  return uuidv7().replace(/-/g, '');
}
