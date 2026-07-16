import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '../shared';

const withOrgContextMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const { loadReleaseBundle } = await import('../bundle-data');

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createClient(bomStatus: string): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const n = normalize(sql);

      if (n.includes('from public.factory_specs fs')) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              spec_code: 'FS-FG5101',
              version: 3,
              status: 'in_review',
              source: 'technical',
              bom_header_id: '22222222-2222-4222-8222-222222222222',
              bom_version: 8,
              fg_item_code: 'FG5101',
              fg_name: 'Kielbasa slaska 450g',
              approver: 'owner@example.test',
              updated_at: '2026-04-30T11:22:00.000Z',
            },
          ],
        };
      }

      if (n.includes('from public.bom_headers bh') && n.includes('where bh.id = $1::uuid')) {
        return {
          rows: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              version: 8,
              status: bomStatus,
              supersedes_version: 7,
            },
          ],
        };
      }

      if (n.includes('from public.bom_headers bh') && n.includes('and bh.product_id = $1')) {
        return {
          rows: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              version: 8,
              status: bomStatus,
            },
          ],
        };
      }

      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (n.includes('from public.bom_lines l')) return { rows: [] };
      if (
        n.includes('from public.bom_lines')
        && n.includes('item_id, component_code')
        && n.includes('order by line_no')
      ) {
        return {
          rows: [
            {
              item_id: '55555555-5555-4555-8555-555555555555',
              component_code: 'RM-ACTIVE-01',
            },
          ],
        };
      }
      if (n.includes('from public.nutrition_allergens')) return { rows: [] };
      if (n.includes('from public.items') && n.includes('item_type')) {
        return {
          rows: [{
            id: '55555555-5555-4555-8555-555555555555',
            item_type: 'rm',
            status: 'active',
            updated_at: '2026-04-30T11:22:00.000Z',
          }],
        };
      }
      if (n.includes('from public.supplier_specs')) return { rows: [] };
      if (n.includes('from public.item_allergen_profiles')) return { rows: [] };
      if (n.includes('from public.wip_definitions')) return { rows: [] };
      if (n.includes('from public.feature_flags_core')) return { rows: [{ is_enabled: false }] };
      if (n.includes('from public.audit_log')) return { rows: [] };
      if (n.includes('from public.audit_events')) return { rows: [] };

      throw new Error(`Unhandled SQL: ${n}`);
    }),
  } as unknown as QueryClient;
}

describe('loadReleaseBundle release preflight', () => {
  beforeEach(() => {
    withOrgContextMock.mockReset();
  });

  it.each(['draft', 'in_review', 'technical_approved', 'active'])(
    'does not block bundle approval for a %s BOM',
    async (bomStatus) => {
      const client = createClient(bomStatus);
      withOrgContextMock.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
        callback({
          userId: '33333333-3333-4333-8333-333333333333',
          orgId: '44444444-4444-4444-8444-444444444444',
          client,
        }),
      );

      const result = await loadReleaseBundle('11111111-1111-4111-8111-111111111111');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.bom.status).toBe(bomStatus);
      expect(result.data.blockers).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'BOM_NOT_APPROVABLE' })]),
      );
    },
  );

  it('still reports a release blocker for terminal invalid BOM states', async () => {
    const client = createClient('archived');
    withOrgContextMock.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({
        userId: '33333333-3333-4333-8333-333333333333',
        orgId: '44444444-4444-4444-8444-444444444444',
        client,
      }),
    );

    const result = await loadReleaseBundle('11111111-1111-4111-8111-111111111111');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'release',
          severity: 'block',
          code: 'BOM_NOT_APPROVABLE',
          message: 'BOM v8 is archived; the bundle requires a draft/in_review/technical_approved/active BOM',
        }),
      ]),
    );
  });
});
