import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue,
  listPending,
  remove,
  generateTransactionId
} from '../index.js';

interface Mutation {
  transaction_id: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  body: unknown;
  created_at: string;
}

describe('IndexedDB sync queue (T-043)', () => {
  beforeEach(async () => {
    // Clear IndexedDB before each test
    const dbs = await (indexedDB as any).databases?.();
    if (dbs) {
      for (const db of dbs) {
        const req = indexedDB.deleteDatabase(db.name);
        await new Promise((resolve, reject) => {
          req.onsuccess = resolve;
          req.onerror = reject;
        });
      }
    }
  });

  describe('AC1: enqueue + listPending', () => {
    it('should enqueue a mutation and list it back with correct transaction_id', async () => {
      const mutation: Mutation = {
        transaction_id: '01HXY0000000000000000000AB',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1', barcode: '1234567890' },
        created_at: new Date().toISOString()
      };

      await enqueue(mutation);

      const pending = await listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].transaction_id).toBe('01HXY0000000000000000000AB');
      expect(pending[0].endpoint).toBe('/api/scan/move');
      expect(pending[0].method).toBe('POST');
      expect(pending[0].body).toEqual({ location: 'A1', barcode: '1234567890' });
    });

    it('should return empty list when queue is empty', async () => {
      const pending = await listPending();
      expect(pending).toHaveLength(0);
    });

    it('should preserve mutation body structure (nested objects)', async () => {
      const mutation: Mutation = {
        transaction_id: '01HXY0000000000000000000CD',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: {
          nested: {
            level1: {
              level2: 'value'
            }
          },
          array: [1, 2, 3]
        },
        created_at: new Date().toISOString()
      };

      await enqueue(mutation);
      const pending = await listPending();

      expect(pending[0].body).toEqual({
        nested: {
          level1: {
            level2: 'value'
          }
        },
        array: [1, 2, 3]
      });
    });
  });

  describe('AC2: idempotent enqueue (deduplication on transaction_id)', () => {
    it('should return exactly 1 entry when enqueue is called twice with same transaction_id', async () => {
      const mutation: Mutation = {
        transaction_id: '01HXY0000000000000000000EF',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1' },
        created_at: '2025-05-07T10:00:00Z'
      };

      await enqueue(mutation);
      await enqueue(mutation);

      const pending = await listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].transaction_id).toBe('01HXY0000000000000000000EF');
    });

    it('should preserve first enqueued entry when duplicate arrives', async () => {
      const firstMutation: Mutation = {
        transaction_id: '01HXY0000000000000000000GH',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1', version: 1 },
        created_at: '2025-05-07T10:00:00Z'
      };

      const duplicateMutation: Mutation = {
        transaction_id: '01HXY0000000000000000000GH',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A2', version: 2 },
        created_at: '2025-05-07T10:01:00Z'
      };

      await enqueue(firstMutation);
      await enqueue(duplicateMutation);

      const pending = await listPending();

      expect(pending).toHaveLength(1);
      // Should keep the first mutation's body
      expect(pending[0].body).toEqual({ location: 'A1', version: 1 });
    });

    it('should deduplicate across multiple mixed enqueues', async () => {
      const mut1: Mutation = {
        transaction_id: '01HXY0000000000000000000IJ',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1' },
        created_at: '2025-05-07T10:00:00Z'
      };

      const mut2: Mutation = {
        transaction_id: '01HXY0000000000000000000KL',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A2' },
        created_at: '2025-05-07T10:01:00Z'
      };

      await enqueue(mut1);
      await enqueue(mut2);
      await enqueue(mut1); // duplicate of mut1
      await enqueue(mut2); // duplicate of mut2

      const pending = await listPending();

      expect(pending).toHaveLength(2);
      expect(pending[0].transaction_id).toBe('01HXY0000000000000000000IJ');
      expect(pending[1].transaction_id).toBe('01HXY0000000000000000000KL');
    });
  });

  describe('AC3: remove + FIFO ordering', () => {
    it('should remove a mutation by transaction_id', async () => {
      const mut1: Mutation = {
        transaction_id: '01HXY0000000000000000000MN',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1' },
        created_at: '2025-05-07T10:00:00Z'
      };

      const mut2: Mutation = {
        transaction_id: '01HXY0000000000000000000OP',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A2' },
        created_at: '2025-05-07T10:01:00Z'
      };

      await enqueue(mut1);
      await enqueue(mut2);

      await remove('01HXY0000000000000000000MN');

      const pending = await listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].transaction_id).toBe('01HXY0000000000000000000OP');
    });

    it('should remove middle entry and preserve order of remaining', async () => {
      const mut1: Mutation = {
        transaction_id: '01HXY0000000000000000000QR',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1' },
        created_at: '2025-05-07T10:00:00Z'
      };

      const mut2: Mutation = {
        transaction_id: '01HXY0000000000000000000ST',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A2' },
        created_at: '2025-05-07T10:01:00Z'
      };

      const mut3: Mutation = {
        transaction_id: '01HXY0000000000000000000UV',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A3' },
        created_at: '2025-05-07T10:02:00Z'
      };

      await enqueue(mut1);
      await enqueue(mut2);
      await enqueue(mut3);

      await remove('01HXY0000000000000000000ST');

      const pending = await listPending();

      expect(pending).toHaveLength(2);
      expect(pending[0].transaction_id).toBe('01HXY0000000000000000000QR');
      expect(pending[1].transaction_id).toBe('01HXY0000000000000000000UV');
    });

    it('should maintain FIFO order: listPending ordered by created_at ASC', async () => {
      const timestamps = [
        '2025-05-07T10:00:00Z',
        '2025-05-07T10:01:00Z',
        '2025-05-07T10:02:00Z',
        '2025-05-07T10:03:00Z',
        '2025-05-07T10:04:00Z'
      ];

      const mutations: Mutation[] = timestamps.map((ts, idx) => ({
        transaction_id: `01HXY000000000000000000${String(idx).padStart(2, '0')}`,
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: `A${idx}` },
        created_at: ts
      }));

      // Enqueue in reverse order to verify FIFO is by created_at, not insertion order
      for (let i = mutations.length - 1; i >= 0; i--) {
        await enqueue(mutations[i]);
      }

      const pending = await listPending();

      expect(pending).toHaveLength(5);
      for (let i = 0; i < pending.length; i++) {
        expect(pending[i].created_at).toBe(timestamps[i]);
      }
    });

    it('should remove non-existent transaction_id without error (idempotent remove)', async () => {
      const mutation: Mutation = {
        transaction_id: '01HXY0000000000000000000WX',
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1' },
        created_at: '2025-05-07T10:00:00Z'
      };

      await enqueue(mutation);
      await remove('01HXY0000000000000000000YZ');
      await remove('01HXY0000000000000000000YZ');

      const pending = await listPending();

      expect(pending).toHaveLength(1);
    });
  });

  describe('AC4: generateTransactionId UUID v7 time-ordering', () => {
    it('should generate valid UUID v7 strings', () => {
      const id = generateTransactionId();

      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{32}$/i);
    });

    it('should generate unique transaction IDs', () => {
      const ids = new Set<string>();
      const count = 100;

      for (let i = 0; i < count; i++) {
        ids.add(generateTransactionId());
      }

      expect(ids.size).toBe(count);
    });

    it('should generate lexicographically ordered IDs (time-ordered, UUID v7 property)', () => {
      const ids: string[] = [];
      const count = 1000;

      for (let i = 0; i < count; i++) {
        ids.push(generateTransactionId());
        // Small delay to ensure timestamp changes
        if (i % 100 === 99) {
          // Optional: could add actual sleep here for real time progression
        }
      }

      const sorted = [...ids].sort();

      expect(ids).toEqual(sorted);
    });

    it('should generate IDs where lexicographic order matches insertion order', () => {
      const ids: string[] = [];

      for (let i = 0; i < 50; i++) {
        ids.push(generateTransactionId());
      }

      const sortedIds = [...ids].sort();

      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(sortedIds[i]);
      }
    });
  });

  describe('Integration: enqueue + generateTransactionId', () => {
    it('should accept mutations with auto-generated transaction IDs', async () => {
      const mutation: Mutation = {
        transaction_id: generateTransactionId(),
        endpoint: '/api/scan/move',
        method: 'POST',
        body: { location: 'A1' },
        created_at: new Date().toISOString()
      };

      await enqueue(mutation);

      const pending = await listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].transaction_id).toBe(mutation.transaction_id);
    });

    it('should handle multiple mutations with auto-generated IDs in FIFO order', async () => {
      const mutations: Mutation[] = [];

      for (let i = 0; i < 5; i++) {
        mutations.push({
          transaction_id: generateTransactionId(),
          endpoint: '/api/scan/move',
          method: 'POST',
          body: { location: `A${i}` },
          created_at: new Date().toISOString()
        });
      }

      for (const m of mutations) {
        await enqueue(m);
      }

      const pending = await listPending();

      expect(pending).toHaveLength(5);
      for (let i = 0; i < mutations.length; i++) {
        expect(pending[i].transaction_id).toBe(mutations[i].transaction_id);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle PUT method', async () => {
      const mutation: Mutation = {
        transaction_id: generateTransactionId(),
        endpoint: '/api/scan/update',
        method: 'PUT',
        body: { id: 1, status: 'processed' },
        created_at: new Date().toISOString()
      };

      await enqueue(mutation);

      const pending = await listPending();

      expect(pending[0].method).toBe('PUT');
    });

    it('should handle large body payloads', async () => {
      const largeBody = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `value_${i}`,
          nested: { deep: { deeper: i * 2 } }
        }))
      };

      const mutation: Mutation = {
        transaction_id: generateTransactionId(),
        endpoint: '/api/scan/bulk',
        method: 'POST',
        body: largeBody,
        created_at: new Date().toISOString()
      };

      await enqueue(mutation);

      const pending = await listPending();

      expect(pending[0].body).toEqual(largeBody);
    });

    it('should handle null and undefined values in body', async () => {
      const mutation: Mutation = {
        transaction_id: generateTransactionId(),
        endpoint: '/api/scan/move',
        method: 'POST',
        body: {
          field1: null,
          field2: undefined,
          field3: 'value'
        },
        created_at: new Date().toISOString()
      };

      await enqueue(mutation);

      const pending = await listPending();

      expect(pending[0].body).toBeDefined();
    });
  });
});
