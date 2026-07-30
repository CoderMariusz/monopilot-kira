import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [] })),
  end: vi.fn(async () => undefined),
}));

vi.mock('@monopilot/db/system-actor-connection.js', () => ({
  cronBearerMatches: (provided: string, expected: string | undefined) =>
    typeof expected === 'string' && expected.length > 0 && provided === expected,
  getSystemActorConnection: () => pool,
}));

async function route() {
  return import('../../app/api/internal/cron/d365-pull/route');
}

beforeEach(() => {
  pool.query.mockClear();
  pool.end.mockClear();
});

describe('D365 pull Vercel cron contract', () => {
  it('registers the nightly D365 pull route in vercel.json', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons?: Array<{ path: string; schedule: string }> };

    expect(config.crons).toContainEqual({
      path: '/api/internal/cron/d365-pull',
      schedule: '0 2 * * *',
    });
  });

  it('accepts Vercel GET invocations and rejects requests without cron authentication', async () => {
    const cronRoute = await route();

    expect(typeof cronRoute.GET).toBe('function');
    if (typeof cronRoute.GET !== 'function') return;

    const accepted = await cronRoute.GET(new Request(
      'http://localhost/api/internal/cron/d365-pull',
      { headers: { 'x-vercel-cron': '1' } },
    ));
    const rejected = await cronRoute.GET(new Request(
      'http://localhost/api/internal/cron/d365-pull',
    ));

    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      ok: true,
      orgs: 0,
      processed: 0,
      results: [],
    });
    expect(rejected.status).toBe(401);
  });
});
