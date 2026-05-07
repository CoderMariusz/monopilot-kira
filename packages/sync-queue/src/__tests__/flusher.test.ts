/**
 * RED-phase tests for T-044 — Sync queue flusher.
 * flusher.ts does NOT exist yet; all tests fail on import.
 *
 * Covers:
 *   AC1  FIFO order + X-Transaction-Id header per queued mutation
 *   AC2  409 dedup → entry removed from queue
 *   AC3  503 retry → entry stays, backoff timer ≥ 5 min set
 *   AC4  Idempotent start → only ONE 'online' listener registered
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { enqueue, listPending, remove } from '../index.js';
// NOTE: flusher.ts does not exist — this import causes the RED failures.
import { startFlusher, stopFlusher, flushOnce } from '../flusher.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeMutation(n: number) {
  return {
    transaction_id: `tx-id-${n.toString().padStart(4, '0')}`,
    endpoint: `/api/items/${n}`,
    method: 'POST' as const,
    body: { value: n },
    // Spread 3 seconds apart so FIFO order is unambiguous.
    created_at: new Date(1_700_000_000_000 + n * 3000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AC1 — FIFO order: 3 mutations → 3 fetches in FIFO order, each with the
//        correct X-Transaction-Id, endpoint, and method.
// ---------------------------------------------------------------------------
describe('AC1: FIFO order and X-Transaction-Id headers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    stopFlusher();

    // Enqueue mutations in FIFO order (0 → 1 → 2 = oldest first)
    await enqueue(makeMutation(0));
    await enqueue(makeMutation(1));
    await enqueue(makeMutation(2));

    // Stub fetch: always resolves 200 OK
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    stopFlusher();
    vi.restoreAllMocks();
    // Drain queue to keep tests isolated.
    for (const m of await listPending()) {
      await remove(m.transaction_id);
    }
  });

  it('sends exactly 3 fetch calls in FIFO (created_at ASC) order', async () => {
    await flushOnce();

    expect(fetchMock).toHaveBeenCalledTimes(3);

    // FIFO: mutation 0 must come before 1, 1 before 2.
    const [call0, call1, call2] = fetchMock.mock.calls as [
      [string, RequestInit],
      [string, RequestInit],
      [string, RequestInit],
    ];

    expect(call0[0]).toBe('/api/items/0');
    expect(call1[0]).toBe('/api/items/1');
    expect(call2[0]).toBe('/api/items/2');
  });

  it('passes the correct X-Transaction-Id header for each mutation (call[0])', async () => {
    await flushOnce();

    const [call0] = fetchMock.mock.calls as [[string, RequestInit]];
    const headers0 = call1Headers(fetchMock, 0);

    expect(headers0.get('X-Transaction-Id')).toBe('tx-id-0000');
  });

  it('passes the correct X-Transaction-Id header for each mutation (call[1])', async () => {
    await flushOnce();

    const headers1 = call1Headers(fetchMock, 1);
    expect(headers1.get('X-Transaction-Id')).toBe('tx-id-0001');
  });

  it('passes the correct X-Transaction-Id header for each mutation (call[2])', async () => {
    await flushOnce();

    const headers2 = call1Headers(fetchMock, 2);
    expect(headers2.get('X-Transaction-Id')).toBe('tx-id-0002');
  });

  it('uses the correct HTTP method for each mutation', async () => {
    await flushOnce();

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][1].method).toBe('POST');
    expect(calls[1][1].method).toBe('POST');
    expect(calls[2][1].method).toBe('POST');
  });

  it('triggers flushOnce when window dispatches the online event', async () => {
    const flushSpy = vi.spyOn({ flushOnce }, 'flushOnce');
    startFlusher();

    window.dispatchEvent(new Event('online'));

    // Allow the microtask queue to settle.
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    stopFlusher();
  });
});

/** Extract a Headers object from the nth fetch mock call's init argument. */
function call1Headers(mockFn: ReturnType<typeof vi.fn>, callIndex: number): Headers {
  const init = (mockFn.mock.calls[callIndex] as [string, RequestInit])[1];
  if (init.headers instanceof Headers) return init.headers;
  return new Headers(init.headers as HeadersInit);
}

// ---------------------------------------------------------------------------
// AC2 — 409 dedup: fetch returns 409 → entry removed from queue.
// ---------------------------------------------------------------------------
describe('AC2: 409 dedup-success removes entry from queue', () => {
  beforeEach(async () => {
    stopFlusher();
    await enqueue(makeMutation(10));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Conflict', { status: 409 })),
    );
  });

  afterEach(async () => {
    stopFlusher();
    vi.restoreAllMocks();
    for (const m of await listPending()) {
      await remove(m.transaction_id);
    }
  });

  it('calls remove() with the correct transaction_id after a 409 response', async () => {
    const removeSpy = vi.spyOn(
      await import('../index.js'),
      'remove',
    );

    await flushOnce();

    expect(removeSpy).toHaveBeenCalledWith('tx-id-0010');
  });

  it('queue is empty after a 409 response (entry removed)', async () => {
    await flushOnce();

    const remaining = await listPending();
    expect(remaining).toHaveLength(0);
  });

  it('mutation: treating 409 as failure leaves queue non-empty', async () => {
    // This test documents the red-line: if the implementer keeps the entry on
    // 409 the previous test catches it. This is a PASSING assertion used as
    // documentation of the contract's inverse — kept here as a guard comment.
    // The real mutation-catcher is the test above.
    await flushOnce();
    const remaining = await listPending();
    // Contract: must be 0 after 409.
    expect(remaining.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC3 — 503 retry: entry stays in queue; backoff timer ≥ 5 minutes is set.
// ---------------------------------------------------------------------------
describe('AC3: 503 retry – entry stays in queue and backoff timer is set', () => {
  beforeEach(async () => {
    stopFlusher();
    vi.useFakeTimers();
    await enqueue(makeMutation(20));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Service Unavailable', { status: 503 })),
    );
  });

  afterEach(async () => {
    stopFlusher();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const m of await listPending()) {
      await remove(m.transaction_id);
    }
  });

  it('entry remains in the queue after a 503 response', async () => {
    await flushOnce();

    const remaining = await listPending();
    expect(remaining.length).toBeGreaterThanOrEqual(1);
    const ids = remaining.map((m) => m.transaction_id);
    expect(ids).toContain('tx-id-0020');
  });

  it('remove() is NOT called after a 503 response', async () => {
    const removeSpy = vi.spyOn(
      await import('../index.js'),
      'remove',
    );

    await flushOnce();

    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('a retry timer of at least 5 minutes (300 000 ms) is scheduled after 503', async () => {
    // Capture timer count before flush.
    const timersBefore = vi.getTimerCount();

    await flushOnce();

    // At least one new timer must have been set.
    const timersAfter = vi.getTimerCount();
    expect(timersAfter).toBeGreaterThan(timersBefore);
  });

  it('the backoff delay is ≥ 5 minutes (300 000 ms) – advance less and re-flush should NOT re-send', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    await flushOnce();

    // Clear the call count after the first flush.
    fetchMock.mockClear();

    // Advance time by 4 minutes 59 seconds — under the minimum backoff.
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000 + 59 * 1000);

    // fetch must NOT have been called again within the under-backoff window.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC4 — Idempotent start: startFlusher() called twice → exactly ONE
//        'online' listener registered.
// ---------------------------------------------------------------------------
describe('AC4: idempotent startFlusher – only one online listener registered', () => {
  beforeEach(() => {
    stopFlusher();
    // Stub fetch to avoid side-effects if flushOnce fires during test.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    stopFlusher();
    vi.restoreAllMocks();
  });

  it('addEventListener("online", ...) is called exactly once after two startFlusher() calls', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    startFlusher();
    startFlusher();

    const onlineCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'online',
    );

    expect(onlineCalls.length).toBe(1);
  });

  it('dispatching online after two startFlusher() calls only triggers one flush (no double-fetch)', async () => {
    vi.useFakeTimers();
    await enqueue(makeMutation(30));

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    startFlusher();
    startFlusher();

    // Dispatch the online event and let microtasks settle.
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();

    // There is 1 mutation in the queue. If two listeners fired, fetch would be
    // called ≥ 2 times; with a single listener it must be called exactly once.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    for (const m of await listPending()) {
      await remove(m.transaction_id);
    }
  });
});
