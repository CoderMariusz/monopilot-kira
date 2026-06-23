import type pg from 'pg';
import {
  cronBearerMatches,
  getSystemActorConnection,
} from '@monopilot/db/system-actor-connection.js';

const VERCEL_CRON_HEADER = 'x-vercel-cron';

interface AuthDecision {
  ok: boolean;
  reason?: string;
}

function authorizeCron(req: Request): AuthDecision {
  const cronSecret = process.env.CRON_SECRET;

  if (req.headers.get(VERCEL_CRON_HEADER) === '1') {
    return { ok: true };
  }

  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const presented = authHeader.slice(7).trim();
    if (cronBearerMatches(presented, cronSecret)) {
      return { ok: true };
    }
    if (
      !cronSecret &&
      process.env.NODE_ENV === 'development' &&
      !process.env.VERCEL_ENV
    ) {
      if (presented.length > 0) return { ok: true };
    }
    return { ok: false, reason: 'invalid_bearer' };
  }

  return { ok: false, reason: 'no_cron_signal' };
}

type ReportingMatviewRow = {
  matviewname: string;
};

type RefreshError = {
  name: string;
  message: string;
};

type RefreshResponse = {
  ok: boolean;
  refreshed: number;
  errors: RefreshError[];
};

function json(body: RefreshResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function POST(req: Request): Promise<Response> {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let pool: ReturnType<typeof getSystemActorConnection>;
  try {
    pool = getSystemActorConnection();
  } catch {
    return json(
      {
        ok: false,
        refreshed: 0,
        errors: [{ name: 'database', message: 'database_not_configured' }],
      },
      500,
    );
  }

  let client: pg.PoolClient | undefined;
  let refreshed = 0;
  const errors: RefreshError[] = [];

  try {
    client = await pool.connect();
    const matviews = await client.query<ReportingMatviewRow>(
      `SELECT matviewname FROM pg_matviews WHERE schemaname='public' AND matviewname LIKE 'v_mv_reporting_%'`,
    );

    for (const row of matviews.rows) {
      try {
        await client.query(
          `REFRESH MATERIALIZED VIEW public.${quoteIdentifier(row.matviewname)}`,
        );
        refreshed += 1;
      } catch (err) {
        errors.push({ name: row.matviewname, message: errorMessage(err) });
      }
    }

    return json({ ok: true, refreshed, errors }, 200);
  } catch (err) {
    return json(
      {
        ok: false,
        refreshed,
        errors: [{ name: 'pg_matviews', message: errorMessage(err) }],
      },
      500,
    );
  } finally {
    client?.release();
    await pool.end();
  }
}
