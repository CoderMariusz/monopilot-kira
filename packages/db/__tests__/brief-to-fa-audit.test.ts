import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const run = databaseUrl ? describe : describe.skip;

let owner: pg.Pool;
let app: pg.Pool;

const tenantId = randomUUID();
const orgAId = randomUUID();
const orgBId = randomUUID();
const userAId = randomUUID();
const roleAId = randomUUID();
const briefAId = randomUUID();

function appConnectionString(): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

run('brief_to_fa_audit schema and RLS (T-033)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for schema/RLS seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user pool for non-vacuous RLS proof
    app = new pg.Pool({ connectionString: appConnectionString() });
    await owner.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'app_user') then
          create role app_user login password '${appUserPassword}';
        else
          alter role app_user login password '${appUserPassword}';
        end if;
      end
      $$;
    `);
    await owner.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-033 Audit Tenant', 'eu', 'https://t033.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await owner.query(
      `insert into public.organizations (id, tenant_id, slug, name, industry_code)
       values
         ($1, $3, $4, 'T-033 Audit Org A', 'fmcg'),
         ($2, $3, $5, 'T-033 Audit Org B', 'fmcg')
       on conflict (id) do nothing`,
      [orgAId, orgBId, tenantId, `t033-a-${orgAId.slice(0, 8)}`, `t033-b-${orgBId.slice(0, 8)}`],
    );
    await owner.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1, $2, 't033-audit-role', false, 't033-audit-role', 'T-033 Audit Role', '[]'::jsonb, false, 10)
       on conflict (id) do nothing`,
      [roleAId, orgAId],
    );
    await owner.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1, $2, $3, 'T-033 User A', 'T-033 User A', $4)
       on conflict (id) do nothing`,
      [userAId, orgAId, `t033-${userAId}@example.test`, roleAId],
    );
    await owner.query(
      `insert into public.brief (brief_id, org_id, template, dev_code, status, created_by_user)
       values ($1, $2, 'single_component', 'DEV2606-3300', 'complete', $3)
       on conflict (brief_id) do nothing`,
      [briefAId, orgAId, userAId],
    );
  }, 120000);

  afterAll(async () => {
    await owner.query(
      `do $$
       begin
         if to_regclass('public.brief_to_fa_audit') is not null then
           delete from public.brief_to_fa_audit where org_id in ('${orgAId}'::uuid, '${orgBId}'::uuid);
         end if;
       end
       $$;`,
    );
    await owner.query(`delete from public.brief where org_id in ($1, $2)`, [orgAId, orgBId]);
    await owner.query(`delete from public.users where org_id in ($1, $2)`, [orgAId, orgBId]);
    await owner.query(`delete from public.roles where org_id in ($1, $2)`, [orgAId, orgBId]);
    await owner.query(`delete from public.organizations where id in ($1, $2)`, [orgAId, orgBId]);
    await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
    await app.end();
    await owner.end();
  });

  it('has the compatibility audit table with forced org-scoped RLS and app_user DML grants', async () => {
    const table = await owner.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `select column_name, data_type, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'brief_to_fa_audit'
        order by ordinal_position`,
    );
    expect(table.rows.map((row) => row.column_name)).toEqual([
      'id',
      'org_id',
      'brief_id',
      'product_code',
      'field_name',
      'applied',
      'mapping_version',
      'created_at',
    ]);

    const rls = await owner.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity
         from pg_class
        where oid = 'public.brief_to_fa_audit'::regclass`,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policy = await owner.query<{ qual: string; with_check: string }>(
      `select qual, with_check
         from pg_policies
        where schemaname = 'public'
          and tablename = 'brief_to_fa_audit'
          and policyname = 'brief_to_fa_audit_org_context'`,
    );
    expect(policy.rows[0]?.qual).toContain('app.current_org_id()');
    expect(policy.rows[0]?.with_check).toContain('app.current_org_id()');
  });

  it('isolates audit rows by org and rejects cross-org WITH CHECK writes under app_user', async () => {
    await owner.query(
      `insert into public.brief_to_fa_audit
         (org_id, brief_id, product_code, field_name, applied, mapping_version)
       values ($1, $2, null, 'C1', true, 1)`,
      [orgAId, briefAId],
    );

    await withAppOrg(orgBId, async (client) => {
      const hidden = await client.query(
        `select id from public.brief_to_fa_audit where brief_id = $1::uuid`,
        [briefAId],
      );
      expect(hidden.rowCount).toBe(0);

      await expect(
        client.query(
          `insert into public.brief_to_fa_audit
             (org_id, brief_id, product_code, field_name, applied, mapping_version)
           values ($1, $2, null, 'C2', true, 1)`,
          [orgAId, briefAId],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });
});

async function withAppOrg<T>(orgId: string, action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const sessionToken = randomUUID();
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
    [sessionToken, orgId],
  );
  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId]);
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await owner.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken]);
  }
}
