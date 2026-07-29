/**
 * 08-Production — canonical WO elapsed-time computation (PF-R13-02).
 *
 * Elapsed minutes = end boundary minus started_at. Terminal states freeze the
 * clock at the last lifecycle timestamp (completed / cancelled / closed); only
 * in_progress and paused use the live clock.
 */

import type { WoState } from './shared';

export type WoElapsedInput = {
  startedAt: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  closedAt?: string | null;
  status: WoState;
  /** Injectable for deterministic tests (defaults to Date.now()). */
  nowMs?: number;
};

/**
 * Resolve the end boundary for elapsed-time display.
 * Priority: completed_at → cancelled_at → closed_at → live clock (active only).
 */
export function resolveWoElapsedEndMs(input: WoElapsedInput): number | null {
  const { startedAt, completedAt, cancelledAt, closedAt, status, nowMs } = input;
  if (startedAt == null) return null;

  const terminalIso = completedAt ?? cancelledAt ?? closedAt ?? null;
  if (terminalIso != null) {
    const ms = Date.parse(terminalIso);
    return Number.isFinite(ms) ? ms : null;
  }

  const isActive = status === 'in_progress' || status === 'paused';
  if (!isActive) return null;

  return nowMs ?? Date.now();
}

export function computeWoElapsedMin(input: WoElapsedInput): number | null {
  const { startedAt } = input;
  if (startedAt == null) return null;

  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return null;

  const endMs = resolveWoElapsedEndMs(input);
  if (endMs == null || !Number.isFinite(endMs)) return null;

  return Math.max(0, Math.round((endMs - startMs) / 60000));
}
