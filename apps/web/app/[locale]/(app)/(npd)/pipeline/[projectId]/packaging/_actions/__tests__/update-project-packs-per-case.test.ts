import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  grantedPerms: new Set<string>(),
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return {
    ...actual,
    hasPermission: async (_client: unknown, _userId: string, _orgId: string, perm: string) =>
      ctx.grantedPerms.has(perm),
  };
});

import { revalidateLocalized } from '../../../../../../../../../lib/i18n/revalidate-localized';
import { updateProjectPacksPerCase } from '../update-project-packs-per-case';
import { PACKAGING_WRITE_PERMISSION } from '../shared';

const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  ctx.grantedPerms = new Set();
  ctx.handler = () => ({ rows: [] });
  vi.mocked(revalidateLocalized).mockClear();
});

describe('updateProjectPacksPerCase', () => {
  it('rejects invalid input', async () => {
    const res = await updateProjectPacksPerCase({ projectId: 'bad', packsPerCase: 6 });
    expect(res).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('returns forbidden without npd.packaging.write', async () => {
    const res = await updateProjectPacksPerCase({ projectId: PROJECT, packsPerCase: 6 });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('updates packs_per_case and syncs FG each_per_box', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      if (/update public\.npd_projects/.test(sql)) return { rows: [{ id: PROJECT }] };
      return { rows: [] };
    };

    const res = await updateProjectPacksPerCase({ projectId: PROJECT, packsPerCase: 12 });
    expect(res).toEqual({ ok: true });

    const projectUpdate = calls.find((c) => /update public\.npd_projects/.test(c.sql));
    expect(projectUpdate?.params).toEqual([PROJECT, 12]);

    const itemSync = calls.find((c) => /update public\.items/.test(c.sql));
    expect(itemSync?.params).toEqual([PROJECT, 12]);

    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/pipeline/${PROJECT}/packaging`, 'page');
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/pipeline/${PROJECT}/brief`, 'page');
  });
});
