import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertRoutingSiteScopeForApproval,
  validateOperationLineSiteScope,
  type QueryClient,
} from '../shared';

const LINE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_NULL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE_1 = '11111111-1111-4111-8111-111111111111';
const SITE_2 = '22222222-2222-4222-8222-222222222222';
const ROUTING_ID = '33333333-3333-4333-8333-333333333333';

function makeClient(lineSites: Record<string, string | null>): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.production_lines')) {
        const lineIds = params[0] as string[];
        return {
          rows: lineIds.map((id) => ({
            id,
            site_id: id in lineSites ? lineSites[id]! : null,
          })),
          rowCount: lineIds.length,
        };
      }
      if (normalized.includes('from public.routings r') && normalized.includes('site_id')) {
        return { rows: [{ site_id: params[1] === ROUTING_ID ? null : SITE_1 }], rowCount: 1 };
      }
      if (normalized.includes('from public.routing_operations ro')) {
        return {
          rows: [
            { line_id: LINE_A },
            { line_id: LINE_B },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('routing site scope (V-TEC-64)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects operations that bind lines from two different sites', async () => {
    const client = makeClient({ [LINE_A]: SITE_1, [LINE_B]: SITE_2 });
    const result = await validateOperationLineSiteScope(client, [LINE_A, LINE_B]);
    expect(result).toEqual({
      ok: false,
      error: 'v_tec_64_cross_site_lines',
      message: 'all routing operations must use production lines from a single site (V-TEC-64)',
    });
  });

  it('rejects mixing site-assigned and org-wide (NULL-site) lines', async () => {
    const client = makeClient({ [LINE_A]: SITE_1, [LINE_NULL]: null });
    const result = await validateOperationLineSiteScope(client, [LINE_A, LINE_NULL]);
    expect(result).toEqual({
      ok: false,
      error: 'v_tec_64_cross_site_lines',
      message:
        'routing operations cannot mix site-assigned and org-wide production lines (V-TEC-64)',
    });
  });

  it('accepts operations when every line shares one site', async () => {
    const client = makeClient({ [LINE_A]: SITE_1, [LINE_B]: SITE_1 });
    const result = await validateOperationLineSiteScope(client, [LINE_A, LINE_B]);
    expect(result).toEqual({ ok: true, canonicalSiteId: SITE_1 });
  });

  it('accepts operations when every line is org-wide (NULL site)', async () => {
    const client = makeClient({ [LINE_A]: null, [LINE_B]: null });
    const result = await validateOperationLineSiteScope(client, [LINE_A, LINE_B]);
    expect(result).toEqual({ ok: true, canonicalSiteId: null });
  });

  it('rejects when routing header pins a site but a line is org-wide', async () => {
    const client = makeClient({ [LINE_A]: SITE_1, [LINE_NULL]: null });
    const result = await validateOperationLineSiteScope(client, [LINE_A, LINE_NULL], SITE_1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('v_tec_64_cross_site_lines');
      expect(result.message).toContain('cannot mix site-assigned and org-wide');
    }
  });

  it('rejects approve when persisted operations span multiple sites', async () => {
    const client = makeClient({ [LINE_A]: SITE_1, [LINE_B]: SITE_2 });
    const result = await assertRoutingSiteScopeForApproval(client, ROUTING_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('v_tec_64_cross_site_lines');
    }
  });
});
