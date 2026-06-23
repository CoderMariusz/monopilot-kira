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
  has_unique_index: boolean;
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

const REPORTING_MATVIEW_QUERY = `
  select mv.matviewname,
         exists (
           select 1
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             join pg_index i on i.indrelid = c.oid
            where n.nspname = mv.schemaname
              and c.relname = mv.matviewname
              and i.indisunique
              and i.indisvalid
              and i.indpred is null
              and i.indexprs is null
         ) as has_unique_index
    from pg_matviews mv
   where mv.schemaname = 'public'
     and mv.matviewname like 'mv\\_reporting\\_%' escape '\\'
   order by mv.matviewname asc`;

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
    const matviews = await client.query<ReportingMatviewRow>(REPORTING_MATVIEW_QUERY);
    console.info('[reporting-refresh] discovered reporting materialized views', {
      count: matviews.rows.length,
      names: matviews.rows.map((row) => row.matviewname),
    });

    for (const row of matviews.rows) {
      try {
        const concurrently = row.has_unique_index ? 'CONCURRENTLY ' : '';
        console.info('[reporting-refresh] refreshing materialized view', {
          name: row.matviewname,
          concurrently: row.has_unique_index,
        });
        await client.query(
          `REFRESH MATERIALIZED VIEW ${concurrently}public.${quoteIdentifier(row.matviewname)}`,
        );
        refreshed += 1;
      } catch (err) {
        errors.push({ name: row.matviewname, message: errorMessage(err) });
      }
    }

    console.info('[reporting-refresh] refresh complete', {
      refreshed,
      errors: errors.length,
    });
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
