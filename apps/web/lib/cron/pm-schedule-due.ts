/**
 * Nightly PM schedule due engine — scans active calendar-due schedules and
 * idempotently generates planned MWOs (pm_schedule_due_engine_v1 / PRD §8).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import {
  runPmScheduleDueEngine,
  type PmScheduleDueEngineSummary,
} from '../maintenance/pm-mwo-generate';

export type PmScheduleDueOrgSummary = {
  orgId: string;
  status: 'completed' | 'error';
} & PmScheduleDueEngineSummary;

export async function runPmScheduleDueForOrg(
  pool: pg.Pool,
  orgId: string,
): Promise<PmScheduleDueOrgSummary> {
  const sessionToken = randomUUID();
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );

  const client = await pool.connect();
  const empty: PmScheduleDueEngineSummary = {
    schedulesScanned: 0,
    created: 0,
    skippedOpen: 0,
    skippedNotDue: 0,
    errors: 0,
  };

  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const summary = await runPmScheduleDueEngine({
      orgId,
      actorUserId: null,
      client,
    });
    await client.query('commit');
    return { orgId, status: 'completed', ...summary };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    console.error('[cron/pm-schedule-due] org failed', { orgId, err });
    return { orgId, status: 'error', ...empty };
  } finally {
    client.release();
    await pool
      .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
      .catch(() => undefined);
  }
}
