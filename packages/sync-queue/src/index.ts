/**
 * IndexedDB sync queue primitive for offline mutations (T-043).
 * This file is a stub for the RED phase - implementation coming in GREEN phase.
 */

export interface Mutation {
  transaction_id: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  body: unknown;
  created_at: string;
}

/**
 * Enqueue a mutation for offline persistence.
 * Mutations are stored by transaction_id - calling enqueue twice with the same
 * transaction_id is idempotent (deduplicates to R14 idempotency contract).
 */
export async function enqueue(mutation: Mutation): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * List all pending mutations in FIFO order (sorted by created_at ASC).
 */
export async function listPending(): Promise<Mutation[]> {
  throw new Error('Not implemented');
}

/**
 * Remove a mutation from the queue by transaction_id.
 * Idempotent - removing non-existent transaction_id is a no-op.
 */
export async function remove(transaction_id: string): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * Generate a UUID v7 transaction ID for client-side mutation tracking.
 * UUID v7 provides time-ordering (monotonic lexicographic order).
 */
export function generateTransactionId(): string {
  throw new Error('Not implemented');
}
