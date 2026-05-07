/**
 * Sync queue flusher (T-044).
 * Drains the sync queue sequentially (FIFO) whenever:
 *   1. The browser comes back online  (window 'online' event)
 *   2. Every 30 seconds as a fallback interval
 *
 * Failure semantics:
 *   2xx       → remove entry (success)
 *   409       → remove entry (server already processed — dedup-success)
 *   5xx / err → keep entry; schedule exponential backoff retry
 *   4xx !409  → keep entry; human intervention required
 */

import { listPending, remove } from './index.js';

// ---------------------------------------------------------------------------
// Backoff schedule: attempt 1 → 5 min, 2 → 30 min, 3 → 2 h, 4+ → 12 h (cap)
// ---------------------------------------------------------------------------
const BACKOFF_MS = [
  5 * 60 * 1000,   // attempt 1 → 5 min
  30 * 60 * 1000,  // attempt 2 → 30 min
  2 * 60 * 60 * 1000,  // attempt 3 → 2 h
  12 * 60 * 60 * 1000, // attempt 4+ → 12 h (cap)
];

/** Per-entry attempt counter (keyed by transaction_id). */
const _attempts = new Map<string, number>();

/** Per-entry backoff timer handle (keyed by transaction_id). */
const _backoffTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleBackoff(entry: { transaction_id: string }): void {
  const id = entry.transaction_id;

  // If a backoff timer is already scheduled for this entry, leave it alone.
  if (_backoffTimers.has(id)) return;

  const attempt = (_attempts.get(id) ?? 0) + 1;
  _attempts.set(id, attempt);

  const delayIndex = Math.min(attempt - 1, BACKOFF_MS.length - 1);
  const delay = BACKOFF_MS[delayIndex];

  const handle = setTimeout(() => {
    _backoffTimers.delete(id);
    // Re-flush so the entry gets retried.
    flushOnce().catch(() => {/* ignore — next tick will retry */});
  }, delay);

  _backoffTimers.set(id, handle);
}

// ---------------------------------------------------------------------------
// Core flush
// ---------------------------------------------------------------------------

/** Re-entrancy guard — prevents concurrent flush invocations. */
let _flushInProgress = false;

/**
 * Drain all pending mutations sequentially (FIFO).
 * Must NOT be parallelised — §10 R14 FIFO contract.
 * Re-entrant callers (e.g. the 30 s interval firing while an online-event
 * flush is still in progress) are silently skipped to avoid double-fetching.
 */
export async function flushOnce(): Promise<void> {
  if (_flushInProgress) return;
  _flushInProgress = true;

  try {
    await _doFlush();
  } finally {
    _flushInProgress = false;
  }
}

async function _doFlush(): Promise<void> {
  const pending = await listPending();

  for (const entry of pending) {
    // Skip entries that are currently waiting on a backoff timer.
    if (_backoffTimers.has(entry.transaction_id)) continue;

    try {
      const res = await fetch(entry.endpoint, {
        method: entry.method,
        body: JSON.stringify(entry.body),
        headers: new Headers({
          'X-Transaction-Id': entry.transaction_id,
          'Content-Type': 'application/json',
        }),
      });

      if ((res.status >= 200 && res.status < 300) || res.status === 409) {
        // Success or dedup-success → remove from queue; reset attempt counter.
        _attempts.delete(entry.transaction_id);
        await remove(entry.transaction_id);
      } else if (res.status >= 500) {
        // 5xx → keep entry; schedule backoff retry.
        scheduleBackoff(entry);
      }
      // 4xx other than 409 → leave in queue; no backoff (human intervention).
    } catch {
      // Network error → backoff retry.
      scheduleBackoff(entry);
    }
  }
}


// ---------------------------------------------------------------------------
// Lifecycle: startFlusher / stopFlusher
// ---------------------------------------------------------------------------

let _isStarted = false;
let _intervalHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Named function reference so the same reference is used for both
 * addEventListener and removeEventListener (required by the idempotent-start
 * contract — an inline arrow would create a new reference each call).
 */
function _onOnline(): void {
  flushOnce().catch(() => {/* ignore */});
}

/**
 * Schedule the next 30-second fallback flush.
 * Uses a chained setTimeout (not setInterval) so the next timer is only
 * added to the fake-timer queue AFTER flushOnce() resolves.  This prevents
 * vi.runAllTimersAsync() from looping infinitely in tests because the new
 * timeout isn't visible to the fake clock until the Promise settles.
 */
function _scheduleNextInterval(): void {
  if (!_isStarted) return;
  _intervalHandle = setTimeout(() => {
    flushOnce()
      .catch(() => {/* ignore */})
      .then(() => _scheduleNextInterval());
  }, 30_000);
}

/**
 * Start the flusher. Idempotent — safe to call multiple times; only one
 * 'online' listener and one interval timer are ever registered.
 */
export function startFlusher(): void {
  if (_isStarted) return;
  _isStarted = true;

  window.addEventListener('online', _onOnline);
  _scheduleNextInterval();
}

/**
 * Stop the flusher. Removes the 'online' listener and clears the interval.
 * Resets the isStarted flag so startFlusher() can be called again.
 */
export function stopFlusher(): void {
  window.removeEventListener('online', _onOnline);

  if (_intervalHandle !== null) {
    clearTimeout(_intervalHandle);
    _intervalHandle = null;
  }

  // Clear per-entry backoff timers.
  for (const handle of _backoffTimers.values()) {
    clearTimeout(handle);
  }
  _backoffTimers.clear();
  _attempts.clear();

  _isStarted = false;
}
