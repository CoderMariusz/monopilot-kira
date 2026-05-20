import { mutateOnboarding } from './advance';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type CreateFirstLocationInput = {
  orgId: string;
  warehouseCode: string;
  path: string;
  pathSegments: [string, string, string, string];
  level: 4;
  zone: string;
  binCode: string;
};

export type CreateFirstLocationResult =
  | { ok: true; locationId: string; level: 4; path: string; nextStep: 'first_product' }
  | { ok: false; error: string };

type InsertRow = { id: string };

export async function createFirstLocation(rawInput: CreateFirstLocationInput): Promise<CreateFirstLocationResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object') {
    return { ok: false, error: 'VALIDATION_FAILED' };
  }
  const { warehouseCode, path, zone, binCode } = rawInput;
  if (!warehouseCode || !path || !zone || !binCode) {
    return { ok: false, error: 'VALIDATION_FAILED' };
  }

  const persist = await persistFirstLocation(rawInput);
  if (persist.ok === false) return persist;

  const advance = await mutateOnboarding('advance', { step: 3 });
  if (advance.ok === false) {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }

  return {
    ok: true,
    locationId: persist.id,
    level: 4,
    path,
    nextStep: 'first_product',
  };
}

async function persistFirstLocation(
  input: CreateFirstLocationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    return await withOrgContext<{ ok: true; id: string } | { ok: false; error: string }>(async (ctx) => {
      const context = ctx as {
        client: {
          query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
        };
      };
      try {
        const { rows: whRows } = await context.client.query<{ id: string }>(
          `select id from public.warehouses where org_id = app.current_org_id() and code = $1 limit 1`,
          [input.warehouseCode],
        );
        const warehouseId = whRows[0]?.id;
        if (!warehouseId) return { ok: false, error: 'NOT_FOUND' };

        const res = await context.client.query<InsertRow>(
          `insert into public.locations (org_id, warehouse_id, code, name, location_type, level, path)
             values (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6)
             returning id`,
          [warehouseId, input.binCode, input.zone, 'bin', input.level, input.path],
        );
        const row = res.rows[0];
        if (!row) return { ok: false, error: 'PERSISTENCE_FAILED' };
        return { ok: true, id: row.id };
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
