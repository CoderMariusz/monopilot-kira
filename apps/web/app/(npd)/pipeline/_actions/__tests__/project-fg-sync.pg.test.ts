/**
 * W2-T3 — C026/C027 real Postgres integration (project ↔ linked FG sync).
 * Requires DATABASE_URL — loud fail, no describe.skip.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { updateProjectBrief } from '../../../../[locale]/(app)/(npd)/pipeline/[projectId]/brief/_actions/update-project-brief';
import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
} from '../../../brief/actions/__tests__/brief-integration-helpers';
import { deleteProject } from '../delete-project';

if (!databaseUrl) {
  throw new Error('project-fg-sync.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const seed = makeIdentitySeed();
const c026ProjectId = randomUUID();
const c027ProjectId = randomUUID();
const c027BlockedProjectId = randomUUID();
const c026ProductCode = `FG-C026-${randomUUID().slice(0, 8).toUpperCase()}`;
const c027ProductCode = `FG-C027-${randomUUID().slice(0, 8).toUpperCase()}`;
const c027BlockedProductCode = `FG-C027B-${randomUUID().slice(0, 8).toUpperCase()}`;
const initialName = 'SOL-R04-initial-name';
const renamedName = 'SOL-R04-renamed-project';

let owner: pg.Pool;
let app: pg.Pool;

async function seedDraftFg(
  projectId: string,
  projectCode: string,
  productCode: string,
  name: string,
): Promise<void> {
  await owner.query(
    `insert into public.npd_projects
       (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
     values ($1, $2, $3, $4, 'standard', 'G0', 'brief', $5, $6)
     on conflict (id) do nothing`,
    [projectId, seed.orgAId, projectCode, name, productCode, seed.userAId],
  );
  await owner.query(
    `insert into public.product
       (org_id, product_code, product_name, created_by_user, app_version)
     values ($1, $2, $3, $4, 'w2-t3-test')
     on conflict do nothing`,
    [seed.orgAId, productCode, name, seed.userAId],
  );
  await owner.query(
    `update public.items
        set npd_project_id = $3::uuid,
            status = 'active'
      where org_id = $1
        and item_code = $2
        and item_type = 'fg'`,
    [seed.orgAId, productCode, projectId],
  );
}

describe('C026 — project name propagates to linked FG (real Postgres)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities(owner, seed);
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.core.write'), ($1, 'npd.project.create')
       on conflict (role_id, permission) do nothing`,
      [seed.roleAId],
    );
    await seedDraftFg(c026ProjectId, 'NPD-C026', c026ProductCode, initialName);
  });

  afterAll(async () => {
    await owner
      ?.query(`delete from public.outbox_events where org_id = $1`, [seed.orgAId])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.audit_events where org_id = $1`, [seed.orgAId])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.npd_projects where id = $1::uuid`, [c026ProjectId])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.items where org_id = $1 and item_code = $2`, [seed.orgAId, c026ProductCode])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.fg_npd_ext where org_id = $1 and item_id in (
        select id from public.items where org_id = $1 and item_code = $2
      )`, [seed.orgAId, c026ProductCode])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.product_legacy where org_id = $1 and product_code = $2`, [
        seed.orgAId,
        c026ProductCode,
      ])
      .catch(() => undefined);
    await app?.end();
    await owner?.end();
  });

  it('keeps public.product.product_name aligned after Brief rename', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      updateProjectBrief({
        projectId: c026ProjectId,
        patch: { productName: renamedName },
      }),
    );
    expect(result).toEqual({ ok: true, data: { projectId: c026ProjectId } });

    const { rows: products } = await owner.query<{ product_name: string | null }>(
      `select product_name
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [seed.orgAId, c026ProductCode],
    );
    expect(products[0]?.product_name).toBe(renamedName);

    const { rows: items } = await owner.query<{ name: string | null }>(
      `select name
         from public.items
        where org_id = $1::uuid
          and item_code = $2
          and item_type = 'fg'`,
      [seed.orgAId, c026ProductCode],
    );
    expect(items[0]?.name).toBe(renamedName);
  });
});

describe('C027 — delete project archives linked draft FG (real Postgres)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities(owner, seed);
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.project.create')
       on conflict (role_id, permission) do nothing`,
      [seed.roleAId],
    );
    await seedDraftFg(c027ProjectId, 'NPD-C027', c027ProductCode, initialName);
    await seedDraftFg(c027BlockedProjectId, 'NPD-C027B', c027BlockedProductCode, initialName);
    await owner.query(
      `update public.fg_npd_ext x
          set built = true
         from public.items i
        where i.id = x.item_id
          and i.org_id = $1
          and i.item_code = $2`,
      [seed.orgAId, c027BlockedProductCode],
    );
  });

  afterAll(async () => {
    await owner
      ?.query(`delete from public.outbox_events where org_id = $1`, [seed.orgAId])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.npd_projects where id in ($1::uuid, $2::uuid)`, [
        c027ProjectId,
        c027BlockedProjectId,
      ])
      .catch(() => undefined);
    for (const code of [c027ProductCode, c027BlockedProductCode]) {
      await owner
        ?.query(`delete from public.fg_npd_ext where org_id = $1 and item_id in (
          select id from public.items where org_id = $1 and item_code = $2
        )`, [seed.orgAId, code])
        .catch(() => undefined);
      await owner
        ?.query(`delete from public.items where org_id = $1 and item_code = $2`, [seed.orgAId, code])
        .catch(() => undefined);
      await owner
        ?.query(`delete from public.product_legacy where org_id = $1 and product_code = $2`, [
          seed.orgAId,
          code,
        ])
        .catch(() => undefined);
    }
    await app?.end();
    await owner?.end();
  });

  it('soft-deletes the linked FG and blocks the technical item atomically', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      deleteProject({ projectId: c027ProjectId }),
    );
    expect(result).toEqual({ ok: true });

    const { rows: projects } = await owner.query(`select id from public.npd_projects where id = $1::uuid`, [
      c027ProjectId,
    ]);
    expect(projects).toHaveLength(0);

    const { rows: products } = await owner.query<{ deleted_at: string | null }>(
      `select deleted_at
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [seed.orgAId, c027ProductCode],
    );
    expect(products[0]?.deleted_at).not.toBeNull();

    const { rows: items } = await owner.query<{ status: string }>(
      `select status
         from public.items
        where org_id = $1::uuid
          and item_code = $2`,
      [seed.orgAId, c027ProductCode],
    );
    expect(items[0]?.status).toBe('blocked');
  });

  it('refuses delete when the linked FG is built (no orphan, no partial delete)', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      deleteProject({ projectId: c027BlockedProjectId }),
    );
    expect(result).toMatchObject({ ok: false, error: 'LINKED_FG_BLOCKED', blockReason: 'LINKED_FG_BUILT' });

    const { rows: projects } = await owner.query(`select id from public.npd_projects where id = $1::uuid`, [
      c027BlockedProjectId,
    ]);
    expect(projects).toHaveLength(1);

    const { rows: products } = await owner.query<{ deleted_at: string | null; built: boolean }>(
      `select deleted_at, built
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [seed.orgAId, c027BlockedProductCode],
    );
    expect(products[0]?.deleted_at).toBeNull();
    expect(products[0]?.built).toBe(true);
  });
});
