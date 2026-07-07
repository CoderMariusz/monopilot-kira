/**
 * POST /api/internal/cron/pm-schedule-due
 *
 * Daily PM schedule due engine (PRD §8 pm_schedule_due_engine_v1). Walks every
 * org, sets org context per org, scans due maintenance_schedules, and generates
 * open planned MWOs idempotently (no duplicate open backlog per schedule).
 *
 * Auth: x-vercel-cron: 1 OR Authorization: Bearer ${CRON_SECRET} (constant time).
 */

import {
  cronBearerMatches,
  getSystemActorConnection,
} from '@monopilot/db/system-actor-connection.js';
import { runPmScheduleDueForOrg } from '../../../../../lib/cron/pm-schedule-due';

const VERCEL_CRON_HEADER = 'x-vercel-cron';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authorizeCron(req: Request): boolean {
  if (req.headers.get(VERCEL_CRON_HEADER) === '1') return true;
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const presented = authHeader.slice(7).trim();
    const cronSecret = process.env.CRON_SECRET;
    if (cronBearerMatches(presented, cronSecret)) return true;
    if (!cronSecret && process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV) {
      return presented.length > 0;
    }
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  if (!authorizeCron(req)) return json({ error: 'unauthorized' }, 401);

  let pool: ReturnType<typeof getSystemActorConnection>;
  try {
    pool = getSystemActorConnection();
  } catch {
    return json({ error: 'database_not_configured' }, 500);
  }

  try {
    const orgs = await pool.query<{ id: string }>(`select id from public.organizations`);
    const results = [];
    for (const row of orgs.rows) {
      results.push(await runPmScheduleDueForOrg(pool, row.id));
    }

    const created = results.reduce((acc, r) => acc + r.created, 0);
    const completed = results.filter((r) => r.status === 'completed').length;
    return json({ ok: true, orgs: results.length, completed, created, results }, 200);
  } catch (err) {
    console.error('[cron/pm-schedule-due] failed', err);
    return json(
      {
        error: 'pm_schedule_due_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      503,
    );
  } finally {
    await pool.end();
  }
}
