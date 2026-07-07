import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { sql: string; params: readonly unknown[] };

const ctx = {
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  grantedPerms: new Set<string>(['technical.bom.version_publish']),
  eco: {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    target_bom_header_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    target_factory_spec_id: null as string | null,
    target_item_id: null as string | null,
    ext_jsonb: {} as Record<string, unknown>,
    status: 'implementing',
  },
  boms: new Map<string, Record<string, unknown>>(),
  calls: [] as Call[],
};

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function fakeClient() {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      ctx.calls.push({ sql, params });
      const s = norm(sql);

      if (s.includes('from public.user_roles ur')) {
        const perm = params[2] as string;
        return { rows: ctx.grantedPerms.has(perm) ? [{ ok: true }] : [] };
      }

      if (s.includes('from public.technical_change_orders')) {
        return {
          rows: [
            {
              id: ctx.eco.id,
              status: 'implementing',
              target_bom_header_id: ctx.eco.target_bom_header_id,
              target_factory_spec_id: ctx.eco.target_factory_spec_id,
              target_item_id: ctx.eco.target_item_id,
              ext_jsonb: ctx.eco.ext_jsonb,
            },
          ],
        };
      }

      if (s.includes('from public.bom_headers')) {
        const id = params[0] as string;
        const row = ctx.boms.get(id);
        return { rows: row ? [row] : [] };
      }

      if (s.startsWith('update public.bom_headers') && s.includes("set status = 'superseded'")) {
        return { rows: [{ id: 'old-active', version: 1 }] };
      }

      if (s.startsWith('update public.bom_headers') && s.includes("set status = 'active'")) {
        return { rows: [{ version: 2 }] };
      }

      if (s.startsWith('insert into public.audit_log') || s.startsWith('insert into public.outbox_events')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({ orgId: ctx.orgId, userId: ctx.userId, sessionToken: 't', client: fakeClient() }),
}));

import { applyEcoOnClose, validateEcoSupersessionLink } from '../../../../../../../../lib/technical/eco-apply-service';
import { publishBomVersion } from '../../../../../../../../lib/technical/bom-publish-service';

beforeEach(() => {
  ctx.grantedPerms = new Set(['technical.bom.version_publish']);
  ctx.eco.ext_jsonb = {};
  ctx.eco.target_bom_header_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  ctx.eco.target_factory_spec_id = null;
  ctx.boms = new Map([
    [
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        product_id: 'FG-100',
        version: 1,
        status: 'active',
        supersedes_bom_header_id: null,
      },
    ],
    [
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        product_id: 'FG-100',
        version: 2,
        status: 'technical_approved',
        supersedes_bom_header_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    ],
  ]);
  ctx.calls = [];
});

afterEach(() => vi.clearAllMocks());

describe('applyEcoOnClose', () => {
  it('requires a linked superseding BOM for BOM-targeting ECOs', async () => {
    const result = await applyEcoOnClose(
      { orgId: ctx.orgId, userId: ctx.userId, client: fakeClient() },
      ctx.eco.id,
    );
    expect(result).toEqual({
      ok: false,
      error: 'supersession_required',
      message: 'link the superseding BOM version before closing this ECO',
    });
  });

  it('publishes a linked technical_approved BOM through canonical publish SQL', async () => {
    ctx.eco.ext_jsonb = { supersedingBomHeaderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' };

    const result = await applyEcoOnClose(
      { orgId: ctx.orgId, userId: ctx.userId, client: fakeClient() },
      ctx.eco.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.applied).toBe(true);
    expect(result.data.bomPublished).toEqual({
      bomHeaderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      productId: 'FG-100',
      version: 2,
    });
    expect(ctx.calls.some((c) => norm(c.sql).includes("set status = 'superseded'"))).toBe(true);
    expect(ctx.calls.some((c) => norm(c.sql).includes("set status = 'active'"))).toBe(true);
    expect(ctx.calls.some((c) => norm(c.sql).includes('insert into public.outbox_events'))).toBe(true);
  });

  it('validates supersession lineage for linkEcoSupersession', async () => {
    const client = fakeClient();
    const valid = await validateEcoSupersessionLink(client, {
      changeOrderId: ctx.eco.id,
      supersedingBomHeaderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
    expect(valid).toEqual({ ok: true });

    const invalid = await validateEcoSupersessionLink(client, {
      changeOrderId: ctx.eco.id,
      supersedingBomHeaderId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toBe('supersession_invalid');
  });

  it('publishBomVersion returns conflict for an already-active version by default', async () => {
    const client = fakeClient();
    const activeBom = ctx.boms.get('dddddddd-dddd-4ddd-8ddd-dddddddddddd')!;
    const result = await publishBomVersion(
      { orgId: ctx.orgId, userId: ctx.userId, client },
      {
        bomHeaderId: activeBom.id as string,
        productId: activeBom.product_id as string,
        version: activeBom.version as number,
      },
    );
    expect(result).toEqual({ ok: false, error: 'conflict', message: 'version already active' });
  });

  it('publishBomVersion allows idempotent re-publish only when allowAlreadyActive is set', async () => {
    const client = fakeClient();
    const activeBom = ctx.boms.get('dddddddd-dddd-4ddd-8ddd-dddddddddddd')!;
    const result = await publishBomVersion(
      { orgId: ctx.orgId, userId: ctx.userId, client },
      {
        bomHeaderId: activeBom.id as string,
        productId: activeBom.product_id as string,
        version: activeBom.version as number,
        allowAlreadyActive: true,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.supersededHeaderIds).toEqual([]);
  });
});
