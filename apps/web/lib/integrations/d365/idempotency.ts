/**
 * T-028 — D365 idempotency [R14 / V-TEC-72].
 *
 * `d365_sync_jobs.idempotency_key` = stable hash of
 * (target_entity + record_key + direction + payload_version). The DB enforces a
 * UNIQUE (org_id, idempotency_key) constraint (migration 164), so a duplicate
 * insert raises SQLSTATE 23505 — the application maps that to a no-op (pull) or
 * a 409 "already accepted" (push). The same scheme backs both pull (T-028) and
 * push (T-029).
 */

import { createHash } from 'node:crypto';

export type D365Direction = 'pull' | 'push';

export type IdempotencyKeyParts = {
  targetEntity: string;
  recordKey: string;
  direction: D365Direction;
  payloadVersion: number;
};

/** Postgres unique_violation. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Deterministic idempotency key. Stable across processes/restarts: the same
 * (entity, record, direction, version) tuple always yields the same key, which
 * is what lets the UNIQUE constraint detect a replay.
 */
export function buildIdempotencyKey(parts: IdempotencyKeyParts): string {
  const canonical = [
    parts.targetEntity,
    parts.recordKey,
    parts.direction,
    String(parts.payloadVersion),
  ].join('|');
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `d365:${parts.direction}:${parts.targetEntity}:${digest.slice(0, 32)}`;
}

/** True when an error is a Postgres unique-violation (duplicate idempotency key). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}
