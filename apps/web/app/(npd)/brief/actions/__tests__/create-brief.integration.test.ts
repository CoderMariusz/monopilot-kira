/**
 * T-031 REWORK — REAL DB-backed integration tests for createBrief.
 *
 * These tests import the production Server Action and drive it through the
 * real withOrgContext app_user transaction/RLS path. Owner SQL is used only
 * for seed, cleanup, and persisted-row assertions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  cleanupIdentities,
  databaseUrl,
  devCode,
  makeAppUserConnectionString,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
  withAppOrg,
} from './brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;
const seed = makeIdentitySeed();

let owner: pg.Pool;
let app: pg.Pool;

run('createBrief — REAL DB integration (T-031 rework)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; action uses withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS checks for cross-org isolation proof
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities(owner, seed);
  }, 120000);

  afterAll(async () => {
    await cleanupIdentities(owner, seed);
    await app.end();
    await owner.end();
  });

  it('creates a draft brief, product line, linked G0 project, and brief.created outbox row in Postgres', async () => {
    const { createBrief } = await import('../create-brief');
    const code = devCode();

    const result = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', code));

    expect(result.ok).toBe(true);
    expect(result.devCode).toBe(code);

    const rows = await owner.query<{
      brief_id: string;
      status: string;
      npd_project_id: string;
      line_count: string;
      brief_created_count: string;
      project_created_count: string;
    }>(
      `select b.brief_id,
              b.status,
              b.npd_project_id,
              (select count(*) from public.brief_lines bl where bl.brief_id = b.brief_id and bl.line_type = 'product') as line_count,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'brief.created' and oe.aggregate_id = b.brief_id::text) as brief_created_count,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'npd.project.created' and oe.aggregate_id = b.npd_project_id::text) as project_created_count
         from public.brief b
        where b.org_id = $1::uuid
          and b.dev_code = $2`,
      [seed.orgAId, code],
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      brief_id: result.briefId,
      status: 'draft',
      npd_project_id: result.npdProjectId,
      line_count: '1',
      brief_created_count: '1',
      project_created_count: '1',
    });
  });

  it('resumes an existing unlinked brief without inserting a duplicate brief on retry after partial failure', async () => {
    const { createBrief } = await import('../create-brief');
    const code = devCode();

    const partial = await owner.query<{ brief_id: string }>(
      `insert into public.brief (org_id, template, dev_code, status, created_by_user, app_version)
       values ($1::uuid, 'multi_component', $2, 'draft', $3::uuid, 'partial-failure-seed')
       returning brief_id`,
      [seed.orgAId, code, seed.userAId],
    );
    const partialBriefId = partial.rows[0]!.brief_id;

    const resumed = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', code));

    expect(resumed.briefId).toBe(partialBriefId);
    const proof = await owner.query<{
      brief_count: string;
      project_count: string;
      linked_project_id: string | null;
      line_count: string;
      event_count: string;
    }>(
      `select
         (select count(*) from public.brief where org_id = $1::uuid and dev_code = $2) as brief_count,
         (select count(*) from public.npd_projects where org_id = $1::uuid and code = $2) as project_count,
         (select npd_project_id from public.brief where brief_id = $3::uuid) as linked_project_id,
         (select count(*) from public.brief_lines where brief_id = $3::uuid and line_type = 'product') as line_count,
         (select count(*) from public.outbox_events where org_id = $1::uuid and event_type in ('brief.created', 'npd.project.created') and aggregate_id::uuid in ($3::uuid, $4::uuid)) as event_count`,
      [seed.orgAId, code, partialBriefId, resumed.npdProjectId],
    );

    expect(proof.rows[0]).toMatchObject({
      brief_count: '1',
      project_count: '1',
      linked_project_id: resumed.npdProjectId,
      line_count: '1',
      event_count: '2',
    });
  });

  it('is idempotent for a same dev_code retry and enforces cross-org RLS isolation', async () => {
    const { createBrief } = await import('../create-brief');
    const code = devCode();

    const first = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', code));
    const retry = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', code));

    expect(retry).toEqual(first);
    const duplicateProof = await owner.query<{ brief_count: string; project_count: string; outbox_count: string }>(
      `select
         (select count(*) from public.brief where org_id = $1::uuid and dev_code = $2) as brief_count,
         (select count(*) from public.npd_projects where org_id = $1::uuid and code = $2) as project_count,
         (select count(*) from public.outbox_events where org_id = $1::uuid and event_type = 'brief.created' and aggregate_id::uuid = $3::uuid) as outbox_count`,
      [seed.orgAId, code, first.briefId],
    );
    expect(duplicateProof.rows[0]).toEqual({ brief_count: '1', project_count: '1', outbox_count: '1' });

    await withAppOrg(owner, app, seed.orgBId, async (client) => {
      const hidden = await client.query(`select brief_id from public.brief where brief_id = $1::uuid`, [first.briefId]);
      expect(hidden.rowCount).toBe(0);

      await expect(
        client.query(
          `insert into public.brief (org_id, template, dev_code, status, created_by_user, app_version)
           values ($1::uuid, 'multi_component', $2, 'draft', $3::uuid, 'rls-cross-org-attempt')`,
          [seed.orgAId, devCode(), seed.userBId],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });
});
