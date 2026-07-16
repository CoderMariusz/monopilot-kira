/**
 * C026 — linked NPD FG name is canonical via npd_projects.name (real Postgres).
 * Covers updateItem direct edit and commitItemsImport bulk path.
 * Requires DATABASE_URL — loud fail, no describe.skip.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  databaseUrl,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
} from '../../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { updateItem } from '../update-item';
import { commitItemsImport } from '../../import/_actions/commit-import';

if (!databaseUrl) {
  throw new Error('update-item-linked-fg-name.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const seed = makeIdentitySeed();
const projectId = randomUUID();
const productCode = `FG-C026-${randomUUID().slice(0, 8).toUpperCase()}`;
const canonicalName = 'C026 canonical project name';
const rogueName = 'C026 rogue technical rename';

let owner: pg.Pool;
let itemId: string;

async function seedLinkedFg(): Promise<void> {
  await owner.query(
    `insert into public.npd_projects
       (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
     values ($1, $2, $3, $4, 'standard', 'G0', 'brief', $5, $6)
     on conflict (id) do nothing`,
    [projectId, seed.orgAId, 'NPD-C026-R2G', canonicalName, productCode, seed.userAId],
  );
  await owner.query(
    `insert into public.product
       (org_id, product_code, product_name, created_by_user, app_version)
     values ($1, $2, $3, $4, 'w2-r2g-test')
     on conflict do nothing`,
    [seed.orgAId, productCode, canonicalName, seed.userAId],
  );
  const { rows } = await owner.query<{ id: string }>(
    `update public.items
        set npd_project_id = $3::uuid,
            name = $4,
            status = 'active'
      where org_id = $1
        and item_code = $2
        and item_type = 'fg'
      returning id::text`,
    [seed.orgAId, productCode, projectId, canonicalName],
  );
  itemId = rows[0]?.id ?? '';
  if (!itemId) {
    const inserted = await owner.query<{ id: string }>(
      `insert into public.items
         (org_id, item_code, item_type, name, uom_base, status, npd_project_id)
       values ($1, $2, 'fg', $3, 'kg', 'active', $4::uuid)
       returning id::text`,
      [seed.orgAId, productCode, canonicalName, projectId],
    );
    itemId = inserted.rows[0]?.id ?? '';
  }
  if (!itemId) throw new Error('Failed to seed linked FG item for C026 test');
}

describe('C026 — linked FG name cannot diverge from npd_projects.name (real Postgres)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedIdentities(owner, seed);
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       select $1, p.permission
         from unnest($2::text[]) as p(permission)
       on conflict (role_id, permission) do nothing`,
      [
        seed.roleAId,
        ['technical.items.create', 'technical.items.edit', 'technical.items.deactivate'],
      ],
    );
    await seedLinkedFg();
  });

  afterAll(async () => {
    await owner
      ?.query(`delete from public.audit_log where org_id = $1::uuid`, [seed.orgAId])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.npd_projects where id = $1::uuid`, [projectId])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.items where org_id = $1::uuid and item_code = $2`, [seed.orgAId, productCode])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.product where org_id = $1::uuid and product_code = $2`, [seed.orgAId, productCode])
      .catch(() => undefined);
    await owner?.end();
  });

  it('updateItem rejects renaming a linked FG', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      updateItem({
        id: itemId,
        name: rogueName,
        itemType: 'fg',
        status: 'active',
        uomBase: 'kg',
        weightMode: 'fixed',
        outputUom: 'base',
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'linked_fg_name_immutable',
    });

    const { rows } = await owner.query<{ name: string }>(
      `select name from public.items where id = $1::uuid`,
      [itemId],
    );
    expect(rows[0]?.name).toBe(canonicalName);
  });

  it('updateItem still allows non-name edits on a linked FG', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      updateItem({
        id: itemId,
        name: canonicalName,
        itemType: 'fg',
        status: 'active',
        uomBase: 'kg',
        weightMode: 'fixed',
        outputUom: 'base',
        description: 'C026 non-name edit ok',
      }),
    );

    expect(result).toEqual({ ok: true, data: { id: itemId } });

    const { rows } = await owner.query<{ name: string; description: string | null }>(
      `select name, description from public.items where id = $1::uuid`,
      [itemId],
    );
    expect(rows[0]?.name).toBe(canonicalName);
    expect(rows[0]?.description).toBe('C026 non-name edit ok');
  });

  it('commitItemsImport rejects bulk rename of a linked FG', async () => {
    const csv = [
      'item_code,name,item_type,uom_base,status,weight_mode',
      `${productCode},${rogueName},fg,kg,active,fixed`,
    ].join('\n');

    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      commitItemsImport('all', csv, 'C026 bulk rename guard verification note'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected commit result');
    expect(result.committed.updated).toBe(0);
    expect(result.committed.errors).toBeGreaterThanOrEqual(1);

    const { rows } = await owner.query<{ name: string }>(
      `select name from public.items where id = $1::uuid`,
      [itemId],
    );
    expect(rows[0]?.name).toBe(canonicalName);
  });
});
