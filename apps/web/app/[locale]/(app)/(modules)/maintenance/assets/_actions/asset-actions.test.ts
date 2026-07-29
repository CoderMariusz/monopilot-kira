import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEquipment,
  deactivateEquipment,
  getAssetPermissions,
  listEquipmentAssets,
  reactivateEquipment,
  updateEquipment,
} from './asset-actions';

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
              deactivated_at: null,
              deactivation_reason: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.equipment')) {
        return { rows: [{ id: EQUIPMENT_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.equipment e') && normalized.includes('name =')) {
        return { rows: [{ id: EQUIPMENT_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.equipment e') && normalized.includes('deactivated_at = pg_catalog.now()')) {
        return { rows: [{ id: EQUIPMENT_ID, site_id: null }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.equipment e') && normalized.includes('set active = true')) {
        return { rows: [{ id: EQUIPMENT_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.equipment e') && normalized.includes('deactivated_at = null')) {
        return { rows: [{ id: EQUIPMENT_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.maintenance_schedules s')) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith('insert into public.maintenance_history')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  grantedPermissions = new Set(['mnt.asset.read', 'mnt.asset.edit', 'mnt.asset.deactivate']);
  client = makeClient();
  revalidateMock.mockClear();
});

describe('getAssetPermissions', () => {
  it('returns read/edit/deactivate flags from RBAC', async () => {
    const result = await getAssetPermissions();
    expect(result).toEqual({ canRead: true, canEdit: true, canDeactivate: true });
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

describe('updateEquipment', () => {
  it('updates mutable fields without changing equipment code', async () => {
    const result = await updateEquipment({
      equipmentId: EQUIPMENT_ID,
      name: 'Renamed mixer',
      equipmentType: 'mixer',
      requiresLoto: false,
      requiresCalibration: true,
    });
    expect(result.ok).toBe(true);
    const updateCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(sql).startsWith('update public.equipment e') && normalize(sql).includes('name ='),
    );
    expect(updateCall?.[1]?.[0]).toBe(EQUIPMENT_ID);
    expect(updateCall?.[1]?.[2]).toBe('Renamed mixer');
  });

  it('requires mnt.asset.edit', async () => {
    grantedPermissions.delete('mnt.asset.edit');
    const result = await updateEquipment({
      equipmentId: EQUIPMENT_ID,
      name: 'Renamed mixer',
      equipmentType: 'mixer',
      requiresLoto: false,
      requiresCalibration: true,
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('deactivateEquipment', () => {
  it('writes withdrawal audit columns and maintenance_history', async () => {
    const result = await deactivateEquipment({
      equipmentId: EQUIPMENT_ID,
      reason: 'Machine scrapped',
    });
    expect(result.ok).toBe(true);
    const withdrawCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(sql).includes('deactivated_at = pg_catalog.now()'),
    );
    expect(withdrawCall?.[1]?.[2]).toBe('Machine scrapped');
    const historyCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(sql).startsWith('insert into public.maintenance_history'),
    );
    expect(historyCall).toBeDefined();
    expect(historyCall?.[1]?.[2]).toBe('Asset withdrawn: Machine scrapped');
    expect(historyCall?.[1]?.[3]).toBe(USER_ID);
    expect(normalize(historyCall?.[0] ?? '')).toContain("'cancellation'");
  });

  it('requires mnt.asset.deactivate', async () => {
    grantedPermissions.delete('mnt.asset.deactivate');
    const result = await deactivateEquipment({
      equipmentId: EQUIPMENT_ID,
      reason: 'Machine scrapped',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('reactivateEquipment', () => {
  it('restores active flag without clearing withdrawal audit columns', async () => {
    const result = await reactivateEquipment({ equipmentId: EQUIPMENT_ID });
    expect(result.ok).toBe(true);
    const reactivateCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(sql).includes('set active = true'),
    );
    expect(reactivateCall).toBeDefined();
    expect(normalize(reactivateCall?.[0] ?? '')).not.toContain('deactivated_at = null');
  });

  it('requires mnt.asset.deactivate', async () => {
    grantedPermissions.delete('mnt.asset.deactivate');
    const result = await reactivateEquipment({ equipmentId: EQUIPMENT_ID });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});
