import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEquipment, getAssetPermissions, listEquipmentAssets } from './asset-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EQUIPMENT_ID = '33333333-3333-4333-8333-333333333333';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let grantedPermissions: Set<string>;
let client: QueryClient;

const revalidateMock = vi.fn();

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: (...args: unknown[]) => revalidateMock(...args),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles') && normalized.includes('join public.roles')) {
        const permission = String(params?.[2] ?? '');
        return { rows: grantedPermissions.has(permission) ? [{ ok: true }] : [], rowCount: 0 };
      }

      if (normalized.startsWith('select id::text, equipment_code')) {
        return {
          rows: [
            {
              id: EQUIPMENT_ID,
              equipment_code: 'MIX-01',
              name: 'Main mixer',
              equipment_type: 'mixer',
              requires_loto: true,
              requires_calibration: false,
              active: true,
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.equipment')) {
        return { rows: [{ id: EQUIPMENT_ID }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  grantedPermissions = new Set(['mnt.asset.read', 'mnt.asset.edit']);
  client = makeClient();
  revalidateMock.mockClear();
});

describe('getAssetPermissions', () => {
  it('returns read/edit flags from RBAC', async () => {
    const result = await getAssetPermissions();
    expect(result).toEqual({ canRead: true, canEdit: true });
  });
});

describe('listEquipmentAssets', () => {
  it('returns equipment rows when mnt.asset.read is granted', async () => {
    const result = await listEquipmentAssets();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.equipmentCode).toBe('MIX-01');
    expect(result.data[0]?.requiresLoto).toBe(true);
  });

  it('returns forbidden without mnt.asset.read', async () => {
    grantedPermissions.delete('mnt.asset.read');
    const result = await listEquipmentAssets();
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('createEquipment', () => {
  it('inserts an equipment row and revalidates assets route', async () => {
    const result = await createEquipment({
      equipmentCode: 'MIX-02',
      name: 'Secondary mixer',
      equipmentType: 'mixer',
      requiresLoto: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.equipmentId).toBe(EQUIPMENT_ID);
    expect(revalidateMock).toHaveBeenCalledWith('/maintenance/assets');
    expect(revalidateMock).toHaveBeenCalledWith('/maintenance');
  });

  it('returns forbidden without mnt.asset.edit', async () => {
    grantedPermissions.delete('mnt.asset.edit');
    const result = await createEquipment({
      equipmentCode: 'MIX-02',
      name: 'Secondary mixer',
      equipmentType: 'mixer',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});
