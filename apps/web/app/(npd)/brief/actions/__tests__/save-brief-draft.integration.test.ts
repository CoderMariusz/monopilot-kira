/**
 * T-031 REWORK — REAL DB-backed integration tests for saveBriefDraft.
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

run('saveBriefDraft — REAL DB integration (T-031 rework)', () => {
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

  it('saves draft header and real brief_lines through the production Server Action', async () => {
    const { createBrief } = await import('../create-brief');
    const { saveBriefDraft } = await import('../save-brief-draft');
    const code = devCode();
    const created = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', code));

    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      saveBriefDraft(created.briefId, {
        productName: 'Italian platter',
        volume: '1200',
        lines: [
          { lineType: 'product', lineIndex: 0, product: 'Italian platter', volume: '1200', devCode: code },
          { lineType: 'component', lineIndex: 1, component: 'Prosciutto', weights: '500' },
          { lineType: 'component', lineIndex: 2, component: 'Provolone', weights: '495' },
          { lineType: 'summary', lineIndex: 99, product: 'Platter total', weights: '1000' },
        ],
      }),
    );

    expect(result).toEqual({ ok: true, briefId: created.briefId, linesSaved: 4 });
    const rows = await owner.query<{ product_name: string; volume: string; line_count: string; component_weight_sum: string }>(
      `select b.product_name,
              b.volume::text,
              (select count(*) from public.brief_lines bl where bl.brief_id = b.brief_id) as line_count,
              (select coalesce(sum(weights), 0)::text from public.brief_lines bl where bl.brief_id = b.brief_id and bl.line_type = 'component') as component_weight_sum
         from public.brief b
        where b.brief_id = $1::uuid`,
      [created.briefId],
    );

    expect(rows.rows[0]).toEqual({
      product_name: 'Italian platter',
      volume: '1200',
      line_count: '4',
      component_weight_sum: '995',
    });
  });

  it('rejects weight mismatch before replacing real DB rows', async () => {
    const { createBrief } = await import('../create-brief');
    const { saveBriefDraft } = await import('../save-brief-draft');
    const created = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', devCode()));

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        saveBriefDraft(created.briefId, {
          lines: [
            { lineType: 'component', lineIndex: 1, component: 'Prosciutto', weights: '500' },
            { lineType: 'component', lineIndex: 2, component: 'Provolone', weights: '350' },
            { lineType: 'summary', lineIndex: 99, product: 'Platter total', weights: '1000' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'WEIGHT_MISMATCH' });

    const lineCount = await owner.query<{ count: string }>(
      `select count(*) from public.brief_lines where brief_id = $1::uuid`,
      [created.briefId],
    );
    expect(lineCount.rows[0]?.count).toBe('1');
  });

  it('cannot update or insert first-org brief rows from a second org RLS context', async () => {
    const { createBrief } = await import('../create-brief');
    const { saveBriefDraft } = await import('../save-brief-draft');
    const created = await withActionActor(seed.userAId, seed.orgAId, () => createBrief('multi_component', devCode()));

    await expect(
      withActionActor(seed.userBId, seed.orgBId, () =>
        saveBriefDraft(created.briefId, {
          productName: 'Cross-org attempt',
          volume: '10',
          lines: [{ lineType: 'product', lineIndex: 0, product: 'Cross-org attempt', volume: '10' }],
        }),
      ),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'BRIEF_NOT_FOUND' });

    await withAppOrg(owner, app, seed.orgBId, async (client) => {
      const hiddenLines = await client.query(`select id from public.brief_lines where brief_id = $1::uuid`, [
        created.briefId,
      ]);
      expect(hiddenLines.rowCount).toBe(0);

      await expect(
        client.query(
          `insert into public.brief_lines (brief_id, org_id, line_type, line_index, dev_code)
           values ($1::uuid, $2::uuid, 'product', 42, $3)`,
          [created.briefId, seed.orgAId, devCode()],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });
});
