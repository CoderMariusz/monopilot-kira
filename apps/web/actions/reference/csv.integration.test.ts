import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { Pool } = pg;

const ORG_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '22222222-2222-4222-8222-022000000155';
const ROLE_ID = '22222222-2222-4222-8222-022000000156';
const TABLE_CODE = 'processes';
const ROW_KEY = 'CSV_REGRESSION_155';

describe('reference CSV import integration', () => {
  const committedReportIds: string[] = [];
  const ownerPool = new Pool({
    connectionString: process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = USER_ID;
    process.env.NEXT_SERVER_ACTION_ORG_ID = ORG_ID;

    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, system, is_system, display_order)
       values ($1::uuid, $2::uuid, 'csv-import-regression-155', 'csv_import_regression_155', 'CSV Import Regression', '[]'::jsonb, false, false, 155)
       on conflict (id) do update
          set org_id = excluded.org_id,
              slug = excluded.slug,
              code = excluded.code,
              name = excluded.name,
              permissions = excluded.permissions`,
      [ROLE_ID, ORG_ID],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1::uuid, $2::uuid, 'csv-import-regression-155@example.invalid', 'CSV Import Regression', 'CSV Import Regression', $3::uuid)
       on conflict (id) do update
          set org_id = excluded.org_id,
              email = excluded.email,
              display_name = excluded.display_name,
              name = excluded.name,
              role_id = excluded.role_id`,
      [USER_ID, ORG_ID, ROLE_ID],
    );
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1::uuid, 'settings.reference.import')
       on conflict do nothing`,
      [ROLE_ID],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1::uuid, $2::uuid, $3::uuid)
       on conflict do nothing`,
      [USER_ID, ROLE_ID, ORG_ID],
    );
    await ownerPool.query(
      `delete from public.reference_tables
        where org_id = $1::uuid
          and table_code = $2
          and row_key = $3`,
      [ORG_ID, TABLE_CODE, ROW_KEY],
    );
  });

  afterAll(async () => {
    await ownerPool.query(
      `delete from public.reference_tables
        where org_id = $1::uuid
          and table_code = $2
          and row_key = $3`,
      [ORG_ID, TABLE_CODE, ROW_KEY],
    );
    if (committedReportIds.length > 0) {
      await ownerPool.query(
        `delete from public.outbox_events
          where org_id = $1::uuid
            and event_type = 'reference.csv.committed'
            and payload->>'reportId' = any($2::text[])`,
        [ORG_ID, committedReportIds],
      );
      await ownerPool.query(
        `delete from public.audit_log
          where org_id = $1::uuid
            and action = 'reference.csv.commit'
            and after_state->>'reportId' = any($2::text[])`,
        [ORG_ID, committedReportIds],
      );
    }
    await ownerPool.query('delete from public.users where id = $1::uuid', [USER_ID]);
    await ownerPool.query('delete from public.user_roles where user_id = $1::uuid and role_id = $2::uuid', [USER_ID, ROLE_ID]);
    await ownerPool.query('delete from public.role_permissions where role_id = $1::uuid', [ROLE_ID]);
    await ownerPool.query('delete from public.roles where id = $1::uuid', [ROLE_ID]);
    await ownerPool.end();
  });

  it('imports a schema-backed reference CSV row and emits reference.csv.committed', async () => {
    const { previewReferenceCsvImport, commitReferenceCsvImport } = await import('./import-csv');

    const preview = await previewReferenceCsvImport({
      tableCode: TABLE_CODE,
      csvText: [
        'row_key,process_code,name,category',
        `${ROW_KEY},${ROW_KEY},CSV regression process,preparation`,
      ].join('\n'),
    });

    if (preview.ok !== true) {
      expect.fail(`preview failed before commit: ${JSON.stringify(preview)}`);
    }
    expect(preview).toMatchObject({
      ok: true,
      data: { summary: { inserted: 1, updated: 0, skipped: 0, errors: 0 } },
    });

    const commit = await commitReferenceCsvImport({ reportId: preview.data.reportId });

    expect(commit).toMatchObject({
      ok: true,
      data: { summary: { inserted: 1, updated: 0, skipped: 0, errors: 0 } },
    });
    committedReportIds.push(preview.data.reportId);

    const persisted = await ownerPool.query<{ row_data: Record<string, unknown> }>(
      `select row_data
         from public.reference_tables
        where org_id = $1::uuid
          and table_code = $2
          and row_key = $3`,
      [ORG_ID, TABLE_CODE, ROW_KEY],
    );
    expect(persisted.rows[0]?.row_data).toMatchObject({
      process_code: ROW_KEY,
      name: 'CSV regression process',
      category: 'preparation',
    });

    const outbox = await ownerPool.query<{ event_type: string; payload: Record<string, unknown> }>(
      `select event_type, payload
         from public.outbox_events
        where org_id = $1::uuid
          and event_type = 'reference.csv.committed'
          and payload->>'tableCode' = $2
          and payload->>'reportId' = $3
        order by id desc
        limit 1`,
      [ORG_ID, TABLE_CODE, preview.data.reportId],
    );
    expect(outbox.rows[0]).toMatchObject({
      event_type: 'reference.csv.committed',
      payload: { tableCode: TABLE_CODE },
    });
  });
});
