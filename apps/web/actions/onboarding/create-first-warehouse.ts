import { mutateOnboarding } from './advance';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type WarehouseType = 'finished' | 'raw' | 'wip' | 'quarantine';

export type CreateFirstWarehouseInput = {
  orgId: string;
  name: string;
  code: string;
  type: WarehouseType;
  address?: string;
};

export type CreateFirstWarehouseResult =
  | {
      ok: true;
      warehouse: { id: string; orgId: string; name: string; code: string; type: WarehouseType };
      organizationModules: { firstWarehouseId: string };
      nextStep: 'first_location';
    }
  | { ok: false; error: 'CODE_TAKEN' | 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; field?: string };

type InsertResult = { rows: Array<{ id: string; org_id: string }>; rowCount: number };

export async function createFirstWarehouse(rawInput: CreateFirstWarehouseInput): Promise<CreateFirstWarehouseResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object') {
    return { ok: false, error: 'VALIDATION_FAILED' };
  }
  const trimmedName = (rawInput.name ?? '').trim();
  const trimmedCode = (rawInput.code ?? '').trim();
  if (!trimmedName || !trimmedCode) {
    return { ok: false, error: 'VALIDATION_FAILED' };
  }

  const persist = await persistFirstWarehouse({
    name: trimmedName,
    code: trimmedCode,
    type: rawInput.type,
    address: rawInput.address ?? '',
  });
  if (persist.ok === false) return persist;

  const advance = await mutateOnboarding('advance', { step: 2 });
  if (advance.ok === false) {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }

  return {
    ok: true,
    warehouse: {
      id: persist.id,
      orgId: persist.orgId,
      name: trimmedName,
      code: trimmedCode,
      type: rawInput.type,
    },
    organizationModules: { firstWarehouseId: persist.id },
    nextStep: 'first_location',
  };
}

async function persistFirstWarehouse(input: {
  name: string;
  code: string;
  type: WarehouseType;
  address: string;
}): Promise<{ ok: true; id: string; orgId: string } | { ok: false; error: 'CODE_TAKEN' | 'PERSISTENCE_FAILED' }> {
  try {
    return await withOrgContext<
      { ok: true; id: string; orgId: string } | { ok: false; error: 'CODE_TAKEN' | 'PERSISTENCE_FAILED' }
    >(async (ctx) => {
      const context = ctx as {
        client: {
          query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
        };
      };
      try {
        const insertSql = `insert into public.warehouses (org_id, code, name, warehouse_type, address)
             values (app.current_org_id(), $1, $2, $3, $4::jsonb)
             returning id, org_id`;
        const params = [
          input.code,
          input.name,
          input.type,
          input.address ? JSON.stringify({ raw: input.address }) : null,
        ];
        const res = (await context.client.query(insertSql, params)) as InsertResult;
        const row = res.rows[0];
        if (!row) return { ok: false, error: 'PERSISTENCE_FAILED' };
        return { ok: true, id: row.id, orgId: row.org_id };
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === '23505') return { ok: false, error: 'CODE_TAKEN' };
        return { ok: false, error: 'PERSISTENCE_FAILED' };
      }
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}
