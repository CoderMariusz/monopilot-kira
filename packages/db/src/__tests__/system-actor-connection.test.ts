import { describe, expect, it } from 'vitest';

describe('T-098 cron system actor helpers', () => {
  it('returns true for a matching cron bearer secret', async () => {
    const { cronBearerMatches } = await import('../system-actor-connection');

    expect(cronBearerMatches('expected-secret', 'expected-secret')).toBe(true);
  });

  it('returns false without throwing for different-length cron bearer input', async () => {
    const { cronBearerMatches } = await import('../system-actor-connection');

    expect(() => cronBearerMatches('short', 'much-longer-expected-secret')).not.toThrow();
    expect(cronBearerMatches('short', 'much-longer-expected-secret')).toBe(false);
  });

  it('fails closed when the expected cron secret is empty or unset', async () => {
    const { cronBearerMatches } = await import('../system-actor-connection');

    expect(cronBearerMatches('provided-secret', '')).toBe(false);
    expect(cronBearerMatches('provided-secret', undefined)).toBe(false);
  });

  it.skipIf(!process.env.DATABASE_URL)(
    "sets app.actor_type to 'system' on the system-actor connection",
    async () => {
      const { getSystemActorConnection } = await import('../system-actor-connection');
      const connection = getSystemActorConnection();

      try {
        const result = await connection.query<{ actor_type: string }>(
          `select current_setting('app.actor_type', true) as actor_type`,
        );

        expect(result.rows[0]?.actor_type).toBe('system');
      } finally {
        await connection.end();
      }
    },
  );
});
