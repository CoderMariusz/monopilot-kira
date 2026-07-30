import { describe, expect, it, vi } from 'vitest';

import {
  assertD365Enabled,
  D365_REQUIRED_CONSTANTS,
  type QueryClient,
} from '../../lib/integrations/d365/gate';
import { processPushJob } from '../../lib/integrations/d365/push';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

class D365Client implements QueryClient {
  readonly calls: string[] = [];

  constructor(private readonly enabled: boolean) {}

  async query<T = unknown>(sql: string): Promise<{ rows: T[]; rowCount: number }> {
    const text = normalize(sql);
    this.calls.push(text);
    if (text.includes('from public.feature_flags_core')) {
      return { rows: [{ is_enabled: this.enabled }] as T[], rowCount: 1 };
    }
    if (text.includes('from "reference"."d365_constants"')) {
      return {
        rows: D365_REQUIRED_CONSTANTS.map((constant_key) => ({
          constant_key,
          constant_value: `${constant_key}-VALUE`,
        })) as T[],
        rowCount: D365_REQUIRED_CONSTANTS.length,
      };
    }
    if (text.includes('public.d365_sync_jobs')) {
      return { rows: [] as T[], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${text}`);
  }
}

describe('XC-011 D365 enabled gate', () => {
  it('fails closed with V-TEC-70 before reading constants when the org flag is off', async () => {
    const client = new D365Client(false);

    await expect(assertD365Enabled(client)).rejects.toMatchObject({
      name: 'D365DisabledError',
      code: 'V-TEC-70',
    });
    expect(client.calls.some((sql) => sql.includes('d365_constants'))).toBe(false);
  });

  it('passes only when the flag is on and every required constant is populated', async () => {
    const client = new D365Client(true);

    await expect(assertD365Enabled(client)).resolves.toBeUndefined();
    expect(client.calls.some((sql) => sql.includes('d365_constants'))).toBe(true);
  });

  it('refuses the push entry before any external D365 call when the flag is off', async () => {
    const client = new D365Client(false);
    const submitWoConfirmation = vi.fn(async () => ({ status: 'ok' as const }));

    await expect(
      processPushJob(
        client,
        { submitWoConfirmation },
        {
          id: '11111111-1111-4111-8111-111111111111',
          org_id: '22222222-2222-4222-8222-222222222222',
          idempotency_key: 'wo-confirmation-1',
          payload: {
            wo_id: '33333333-3333-4333-8333-333333333333',
            quantity: 1,
          },
        },
        { backoffMs: [0, 0, 0], sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'V-TEC-70' });
    expect(submitWoConfirmation).not.toHaveBeenCalled();
  });
});
