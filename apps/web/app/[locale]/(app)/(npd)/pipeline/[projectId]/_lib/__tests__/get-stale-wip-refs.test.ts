import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orgId = '07300000-0000-4000-8000-00000000000a';
const userId = '07300000-0000-4000-8000-0000000000aa';
const projectId = '07300000-0000-4000-8000-0000000000ab';
const versionId = '07300000-0000-4000-8000-0000000000ac';
const v2Id = '07300000-0000-4000-8000-0000000000d2';
const v3Id = '07300000-0000-4000-8000-0000000000d3';
const v4Id = '07300000-0000-4000-8000-0000000000d4';

const hasPermissionMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      orgId,
      userId,
      client: {
        query: (...args: unknown[]) => queryMock(...args),
      },
    }),
}));

vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

const queryMock = vi.hoisted(() => vi.fn(async () => ({ rows: [] as unknown[] })));

describe('getStaleWipRefs — supersedes chain (PF-R05-02)', () => {
  beforeEach(() => {
    queryMock.mockReset();
    hasPermissionMock.mockReset();
    hasPermissionMock.mockResolvedValue(true);
  });

  it('detects a project pinned to v2 when v3 supersedes it', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('coalesce(') && sql.includes('version_id')) {
        return { rows: [{ version_id: versionId }] };
      }
      if (sql.includes('from public.formulation_ingredients fi') && sql.includes('join public.wip_definitions')) {
        return {
          rows: [{ wip_definition_id: v2Id, name: 'Sauce base', version: 2 }],
        };
      }
      if (sql.includes('with recursive') && sql.includes('roots as')) {
        return {
          rows: [
            { wip_definition_id: v2Id, name: 'Sauce base', version: 2, supersedes_wip_definition_id: null },
            { wip_definition_id: v3Id, name: 'Sauce base', version: 3, supersedes_wip_definition_id: v2Id },
          ],
        };
      }
      if (sql.includes('from public.wip_definition_acks')) return { rows: [] };
      if (sql.includes('from public.user_notifications')) return { rows: [] };
      return { rows: [] };
    });

    const { getStaleWipRefs } = await import('../get-stale-wip-refs');
    const result = await getStaleWipRefs({ projectId });

    expect(result.staleDefinitions).toHaveLength(1);
    expect(result.staleDefinitions[0]).toMatchObject({
      wipDefinitionId: v2Id,
      version: 3,
      name: 'Sauce base',
    });
  });

  it('does not flag a project already on the active head version', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('coalesce(') && sql.includes('version_id')) {
        return { rows: [{ version_id: versionId }] };
      }
      if (sql.includes('from public.formulation_ingredients fi') && sql.includes('join public.wip_definitions')) {
        return {
          rows: [{ wip_definition_id: v4Id, name: 'Sauce base', version: 4 }],
        };
      }
      if (sql.includes('with recursive') && sql.includes('roots as')) {
        return {
          rows: [{ wip_definition_id: v4Id, name: 'Sauce base', version: 4, supersedes_wip_definition_id: v3Id }],
        };
      }
      if (sql.includes('from public.wip_definition_acks')) return { rows: [] };
      if (sql.includes('from public.user_notifications')) return { rows: [] };
      return { rows: [] };
    });

    const { getStaleWipRefs } = await import('../get-stale-wip-refs');
    const result = await getStaleWipRefs({ projectId });

    expect(result.staleDefinitions).toHaveLength(0);
  });

  it('uses the recursive lineage query (shared read path, not per-caller copies)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('coalesce(') && sql.includes('version_id')) {
        return { rows: [{ version_id: versionId }] };
      }
      if (sql.includes('from public.formulation_ingredients fi')) {
        return { rows: [{ wip_definition_id: v2Id, name: 'Sauce base', version: 2 }] };
      }
      if (sql.includes('with recursive')) {
        return {
          rows: [
            { wip_definition_id: v2Id, name: 'Sauce base', version: 2, supersedes_wip_definition_id: null },
            { wip_definition_id: v3Id, name: 'Sauce base', version: 3, supersedes_wip_definition_id: v2Id },
            { wip_definition_id: v4Id, name: 'Sauce base', version: 4, supersedes_wip_definition_id: v3Id },
          ],
        };
      }
      return { rows: [] };
    });

    const { getStaleWipRefs } = await import('../get-stale-wip-refs');
    const result = await getStaleWipRefs({ projectId: randomUUID() });

    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('with recursive'))).toBe(true);
    expect(result.staleDefinitions[0]?.version).toBe(4);
  });
});
