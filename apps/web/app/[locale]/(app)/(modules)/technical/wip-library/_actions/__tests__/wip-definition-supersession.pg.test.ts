/**
 * Wave 15 — WIP definition supersession lifecycle (N-22).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../../packages/db/src/clients.js';
import { saveWipDefinition } from '../wip-definition-actions';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const itemId = randomUUID();
const activeDefId = randomUUID();

const baseSaveInput = {
  id: activeDefId,
  name: 'Cream base',
  baseUom: 'kg' as const,
  yieldPct: 100,
  reusable: true,
  ingredients: [] as Array<{ itemId: string; qtyPerUnit: number; uom: string; sequence: number }>,
  processes: [] as Array<{
    processName: string;
    displayOrder: number;
    durationHours: number;
    additionalCost: number;
    setupCost: number;
    roles: Array<{ roleGroup: string; headcount: number }>;
  }>,
};

runPg('WIP definition supersession lifecycle (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave15 WIP Tenant', 'eu', 'https://wave15-wip.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave15 WIP Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w15-wip-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'wip-editor', 'wip-editor', 'WIP Editor', '["technical.wip.edit"]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Wave15 WIP User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `w15-wip-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'intermediate', 'Cream base item', 'kg', 'active')
       on conflict (id) do nothing`,
      [itemId, orgId, `WIP-${itemId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.wip_definitions
         (id, org_id, item_id, name, base_uom, yield_pct, version, status, reusable, created_by)
       values ($1, $2, $3, 'Cream base', 'kg', 100, 3, 'active', true, $4)
       on conflict (id) do nothing`,
      [activeDefId, orgId, itemId, userId],
    );
  });

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    await ownerPool?.query('delete from public.user_notifications where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.outbox_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wip_definition_ingredients where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wip_definitions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('serializes concurrent saveWipDefinition calls into monotonic versions with preserved lineage', async () => {
    const [firstResult, secondResult] = await Promise.all([
      saveWipDefinition({ ...baseSaveInput, description: 'concurrent save A' }),
      saveWipDefinition({ ...baseSaveInput, description: 'concurrent save B' }),
    ]);

    expect(firstResult).toMatchObject({ ok: true });
    expect(secondResult).toMatchObject({ ok: true });
    if (!firstResult.ok || !secondResult.ok) return;

    const versions = [firstResult.version, secondResult.version].sort((a, b) => a - b);
    expect(versions).toEqual([4, 5]);

    const { rows } = await ownerPool.query<{
      id: string;
      version: number;
      status: string;
      description: string | null;
      supersedes_wip_definition_id: string | null;
    }>(
      `select id::text,
              version,
              status,
              description,
              supersedes_wip_definition_id::text
         from public.wip_definitions
        where org_id = $1::uuid
          and lower(name) = lower('Cream base')
        order by version`,
      [orgId],
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      id: activeDefId,
      version: 3,
      status: 'archived',
      description: null,
      supersedes_wip_definition_id: null,
    });

    const activeRows = rows.filter((row) => row.status === 'active');
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]?.version).toBe(5);

    const successorIds = new Set([firstResult.id, secondResult.id]);
    expect(successorIds.size).toBe(2);

    const v4 = rows.find((row) => row.version === 4);
    const v5 = rows.find((row) => row.version === 5);
    expect(v4?.supersedes_wip_definition_id).toBe(activeDefId);
    expect(v5?.supersedes_wip_definition_id).toBe(v4?.id);
    expect(v4?.description).toMatch(/concurrent save/);
    expect(v5?.description).toMatch(/concurrent save/);
    expect(v4?.description).not.toBe(v5?.description);
  });
});
