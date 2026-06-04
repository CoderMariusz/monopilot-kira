/**
 * T-029 — D365 push worker: retry/backoff → DLQ (V-TEC-71), DLQ retry success,
 * idempotency 409 → completed.
 *
 * Real-DB integration. Skipped when DATABASE_URL is unset. D365 is mocked via an
 * injected `D365PushClient`; backoff sleeps are stubbed so retries run instantly.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  D365_MAX_RETRIES,
  enqueuePushJob,
  processPushJob,
  retryDlqEntry,
  type D365PushClient,
  type D365PushResponse,
  type WoConfirmationPayload,
} from '../push';
import { makeHarness, type Harness } from './helpers';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const noopSleep = async () => undefined;
const fastBackoff = [0, 0, 0];

function payload(woId: string): WoConfirmationPayload {
  return { wo_id: woId, d365_item_id: 'D365-FG-1', quantity: 100 };
}

function pushClient(responses: D365PushResponse[]): { client: D365PushClient } {
  let calls = 0;
  const client: D365PushClient = {
    submitWoConfirmation: async () => {
      const r = responses[Math.min(calls, responses.length - 1)]!;
      calls += 1;
      return r;
    },
  };
  return { client };
}

run('T-029 D365 push worker', () => {
  let h: Harness;

  beforeAll(() => {
    h = makeHarness();
  });

  afterAll(async () => {
    await h.cleanup();
  });

  it('AC1: D365 returns 500 three times → DLQ row inserted with error_message NOT NULL', async () => {
    const org = await h.createOrg();
    const err500: D365PushResponse = { status: 'error', httpStatus: 500, message: 'D365 unavailable' };
    const { client: d365 } = pushClient([err500, err500, err500]);

    await org.runAsApp(async (client) => {
      const enq = await enqueuePushJob(client, org.orgId, { recordKey: 'wo-500', payload: payload('wo-500') });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      const result = await processPushJob(
        client,
        d365,
        { id: enq.job.id, org_id: org.orgId, idempotency_key: enq.job.idempotency_key, payload: payload('wo-500') },
        { sleep: noopSleep, backoffMs: fastBackoff },
      );
      expect(result.status).toBe('dead_lettered');
      expect(result.attempts).toBe(D365_MAX_RETRIES);

      const dlq = await client.query<{ error_message: string; retry_count: number }>(
        `select error_message, retry_count from public.d365_sync_dlq
          where org_id = app.current_org_id() and job_id = $1::uuid`,
        [enq.job.id],
      );
      expect(dlq.rows.length).toBe(1);
      expect((dlq.rows[0]?.error_message ?? '').trim().length).toBeGreaterThan(0);

      const job = await client.query<{ status: string }>(
        `select status from public.d365_sync_jobs where id = $1::uuid`,
        [enq.job.id],
      );
      expect(job.rows[0]?.status).toBe('dead_lettered');
    });
  });

  it('retries with the 1s/5s/25s backoff schedule (sleeper invoked between attempts)', async () => {
    const org = await h.createOrg();
    const err500: D365PushResponse = { status: 'error', httpStatus: 500, message: 'boom' };
    const { client: d365 } = pushClient([err500, err500, err500]);
    const sleep = vi.fn(async () => undefined);

    await org.runAsApp(async (client) => {
      const enq = await enqueuePushJob(client, org.orgId, { recordKey: 'wo-backoff', payload: payload('wo-backoff') });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      await processPushJob(
        client,
        d365,
        { id: enq.job.id, org_id: org.orgId, idempotency_key: enq.job.idempotency_key, payload: payload('wo-backoff') },
        { sleep },
      );
      // 3 attempts → 2 backoff sleeps (no sleep after the final attempt), with the
      // canonical 1s then 5s delays.
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenNthCalledWith(1, 1000);
      expect(sleep).toHaveBeenNthCalledWith(2, 5000);
    });
  });

  it('AC3: duplicate idempotency_key → D365 returns 409 → job marked completed (already accepted)', async () => {
    const org = await h.createOrg();
    const conflict: D365PushResponse = { status: 'conflict' };
    const { client: d365 } = pushClient([conflict]);

    await org.runAsApp(async (client) => {
      const enq = await enqueuePushJob(client, org.orgId, { recordKey: 'wo-409', payload: payload('wo-409') });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      const result = await processPushJob(
        client,
        d365,
        { id: enq.job.id, org_id: org.orgId, idempotency_key: enq.job.idempotency_key, payload: payload('wo-409') },
        { sleep: noopSleep },
      );
      expect(result.status).toBe('completed');
      expect(result.alreadyAccepted).toBe(true);

      const job = await client.query<{ status: string }>(
        `select status from public.d365_sync_jobs where id = $1::uuid`,
        [enq.job.id],
      );
      expect(job.rows[0]?.status).toBe('completed');

      // No DLQ row for a 409.
      const dlq = await client.query<{ c: string }>(
        `select count(*)::text as c from public.d365_sync_dlq where org_id = app.current_org_id() and job_id = $1::uuid`,
        [enq.job.id],
      );
      expect(dlq.rows[0]?.c).toBe('0');
    });
  });

  it('AC2: DLQ retry — mock returns 200 → DLQ.resolved_at set, job completed', async () => {
    const org = await h.createOrg();
    const err500: D365PushResponse = { status: 'error', httpStatus: 500, message: 'boom' };
    const ok: D365PushResponse = { status: 'ok' };
    const { client: failing } = pushClient([err500, err500, err500]);
    const { client: recovering } = pushClient([ok]);

    await org.runAsApp(async (client) => {
      const enq = await enqueuePushJob(client, org.orgId, { recordKey: 'wo-retry', payload: payload('wo-retry') });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      await processPushJob(
        client,
        failing,
        { id: enq.job.id, org_id: org.orgId, idempotency_key: enq.job.idempotency_key, payload: payload('wo-retry') },
        { sleep: noopSleep, backoffMs: fastBackoff },
      );

      const dlqRow = await client.query<{ id: string }>(
        `select id from public.d365_sync_dlq where org_id = app.current_org_id() and job_id = $1::uuid`,
        [enq.job.id],
      );
      const dlqId = dlqRow.rows[0]?.id;
      expect(dlqId).toBeTruthy();

      const retry = await retryDlqEntry(client, recovering, dlqId!, org.userId);
      expect(retry.ok).toBe(true);

      const resolved = await client.query<{ resolved_at: string | null; status: string }>(
        `select resolved_at, status from public.d365_sync_dlq where id = $1::uuid`,
        [dlqId],
      );
      expect(resolved.rows[0]?.resolved_at).not.toBeNull();
      expect(resolved.rows[0]?.status).toBe('retried');

      const job = await client.query<{ status: string }>(
        `select status from public.d365_sync_jobs where id = $1::uuid`,
        [enq.job.id],
      );
      expect(job.rows[0]?.status).toBe('completed');
    });
  });
});
