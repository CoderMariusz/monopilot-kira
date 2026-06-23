import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const WITH_ORG_CONTEXT_MODULE = '../../../../../../../lib/auth/with-org-context';
const SENSORY_PANEL_MODULE =
  '../../../../../../[locale]/(app)/(npd)/pipeline/[projectId]/sensory/_actions/getSensoryPanel';

const tenantId = randomUUID();
const orgA = randomUUID();
const orgB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const roleA = randomUUID();
const roleB = randomUUID();
const projectA = randomUUID();
const projectB = randomUUID();
const formulationA = randomUUID();
const formulationB = randomUUID();
const versionA = randomUUID();
const versionB = randomUUID();
const productA = `FA-T078-${randomUUID().slice(0, 8)}`;
const productB = `FA-T078-${randomUUID().slice(0, 8)}`;
const cascadeEventA = randomUUID();
const cascadeEventB = randomUUID();

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

let owner: pg.Pool;
let appPool: pg.Pool;

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

type MockSensoryResult =
  | { state: 'ready'; data: { overallScore: string | null } }
  | { state: 'empty'; data: null };

function buildApprovalQueryHandler(opts: {
  marginPct?: string;
  thresholdRow?: { value_int: number | null; value_text: string | null };
  cascadeAudited?: boolean;
  projectId?: string | null;
} = {}): QueryHandler {
  return (sql) => {
    if (sql.includes('from public.product')) {
      return {
        rows: [{
          product_code: productA,
          allergens: ['gluten'],
          may_contain: [],
        }],
      };
    }
    if (sql.includes('from public.npd_projects')) {
      return { rows: opts.projectId === null ? [] : [{ id: opts.projectId ?? projectA }] };
    }
    if (sql.includes('from public.formulations')) {
      return { rows: [{ locked_at: new Date('2026-01-01T00:00:00Z'), current_version_id: null }] };
    }
    if (sql.includes('from public.nutri_score_results')) {
      return { rows: [{ grade: 'B' }] };
    }
    if (sql.includes('from public.costing_breakdowns')) {
      return { rows: [{ margin_pct: opts.marginPct ?? '20.00' }] };
    }
    if (sql.includes('"Reference"."AlertThresholds"')) {
      return { rows: opts.thresholdRow ? [opts.thresholdRow] : [] };
    }
    if (sql.includes('from public.allergen_cascade_rebuild_jobs')) {
      return { rows: [{ audited: opts.cascadeAudited ?? true }] };
    }
    if (sql.includes('from public.risks')) {
      return { rows: [{ open_high_count: '0' }] };
    }
    if (sql.includes('from public.compliance_docs')) {
      return { rows: [{ active_count: '1', expired_count: '0', invalid_count: '0' }] };
    }
    return { rows: [] };
  };
}

async function importEvaluateWithMocks(opts: {
  handler?: QueryHandler;
  sensoryResult?: MockSensoryResult;
} = {}) {
  const handler = opts.handler ?? buildApprovalQueryHandler();
  const getSensoryPanelMock = vi.fn(async () => opts.sensoryResult ?? { state: 'empty', data: null });

  vi.resetModules();
  vi.doMock(WITH_ORG_CONTEXT_MODULE, () => ({
    withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
      action({
        orgId: orgA,
        userId: userA,
        sessionToken: 'test-session',
        client: {
          query: async (sql: string, params?: readonly unknown[]) => handler(sql, params),
        },
      }),
  }));
  vi.doMock(SENSORY_PANEL_MODULE, () => ({
    getSensoryPanel: getSensoryPanelMock,
  }));

  const mod = await import('../evaluate');
  return { evaluateApprovalCriteria: mod.evaluateApprovalCriteria, getSensoryPanelMock };
}

afterEach(() => {
  vi.doUnmock(WITH_ORG_CONTEXT_MODULE);
  vi.doUnmock(SENSORY_PANEL_MODULE);
  vi.resetModules();
});

describe('evaluateApprovalCriteria Server Action — input wiring', () => {
  it('forwards the org margin threshold so C3 can override the default 15 percent', async () => {
    const { evaluateApprovalCriteria } = await importEvaluateWithMocks({
      handler: buildApprovalQueryHandler({
        marginPct: '18.00',
        thresholdRow: { value_int: 20, value_text: null },
      }),
    });

    const result = await evaluateApprovalCriteria(productA);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C3 : null).toBe('warn');
  });

  it('uses the domain default 15 percent for C3 when the org threshold row is absent', async () => {
    const { evaluateApprovalCriteria } = await importEvaluateWithMocks({
      handler: buildApprovalQueryHandler({ marginPct: '18.00' }),
    });

    const result = await evaluateApprovalCriteria(productA);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C3 : null).toBe('pass');
  });

  it('requires C4 and wires the sensory mean score when a panel exists', async () => {
    const { evaluateApprovalCriteria, getSensoryPanelMock } = await importEvaluateWithMocks({
      sensoryResult: { state: 'ready', data: { overallScore: '6.50' } },
    });

    const result = await evaluateApprovalCriteria(productA);

    expect(getSensoryPanelMock).toHaveBeenCalledWith(projectA);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C4 : null).toBe('warn');
  });

  it('marks C4 not required when no sensory panel exists', async () => {
    const { evaluateApprovalCriteria } = await importEvaluateWithMocks({
      sensoryResult: { state: 'empty', data: null },
    });

    const result = await evaluateApprovalCriteria(productA);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C4 : null).toBe('not_required');
  });

  it('keeps C5 pending when no processed allergen cascade row exists', async () => {
    const { evaluateApprovalCriteria } = await importEvaluateWithMocks({
      handler: buildApprovalQueryHandler({ cascadeAudited: false }),
    });

    const result = await evaluateApprovalCriteria(productA);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C5 : null).toBe('pending');
  });

  it('passes C5 when a processed allergen cascade row exists', async () => {
    const { evaluateApprovalCriteria } = await importEvaluateWithMocks({
      handler: buildApprovalQueryHandler({ cascadeAudited: true }),
    });

    const result = await evaluateApprovalCriteria(productA);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C5 : null).toBe('pass');
  });
});

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedOrg(orgId: string, roleId: string, userId: string, projectId: string, productCode: string): Promise<void> {
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, $3, 'fmcg')
     on conflict (id) do nothing`,
    [orgId, tenantId, `T-078 Org ${orgId.slice(0, 4)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, $3, 'T-078 Role', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleId, orgId, `t078-${orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $3, 'T-078 User', $4)
     on conflict (id) do update set org_id = excluded.org_id, role_id = excluded.role_id`,
    [userId, orgId, `t078-${userId}@example.test`, roleId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user, allergens, may_contain)
     values ($1, $2, $3, 1, $4, array['gluten']::text[], '{}'::text[])
     on conflict (org_id, product_code) do update
       set org_id = excluded.org_id,
           created_by_user = excluded.created_by_user,
           allergens = excluded.allergens,
           may_contain = excluded.may_contain`,
    [productCode, orgId, `T-078 ${productCode}`, userId],
  );
  await owner.query(
    `insert into public.npd_projects (id, org_id, code, name, type, product_code)
     values ($1, $2, $3, 'T-078 Approval Project', 'standard', $4)
     on conflict (id) do nothing`,
    [projectId, orgId, `NPD-${productCode}`, productCode],
  );
}

async function seedSatisfiedApprovalRows(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-078 Approval Tenant', 'eu', 'https://t078.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );

  await seedOrg(orgA, roleA, userA, projectA, productA);
  await seedOrg(orgB, roleB, userB, projectB, productB);

  await owner.query(
    `insert into public.formulations (id, org_id, project_id, product_code, locked_at, locked_by_user)
     values ($1, $2, $3, $4, now(), $5),
            ($6, $7, $8, $9, now(), $10)
     on conflict (id) do nothing`,
    [formulationA, orgA, projectA, productA, userA, formulationB, orgB, projectB, productB, userB],
  );
  await owner.query(
    `insert into public.formulation_versions (id, formulation_id, version_number, state)
     values ($1, $2, 1, 'locked'),
            ($3, $4, 1, 'locked')
     on conflict (id) do nothing`,
    [versionA, formulationA, versionB, formulationB],
  );
  await owner.query(`update public.formulations set current_version_id = $1 where id = $2`, [versionA, formulationA]);
  await owner.query(`update public.formulations set current_version_id = $1 where id = $2`, [versionB, formulationB]);

  await owner.query(
    `insert into public.nutri_score_results
       (org_id, product_code, formulation_version_id, grade, computed_score)
     values ($1, $2, $3, 'B', 1),
            ($4, $5, $6, 'B', 1)
     on conflict on constraint nutri_score_results_org_product_version_unique
     do update set grade = excluded.grade, computed_score = excluded.computed_score`,
    [orgA, productA, versionA, orgB, productB, versionB],
  );
  await owner.query(
    `insert into public.costing_breakdowns
       (org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur)
     values ($1, $2, 'target', 8.00, 20.00, 10.00),
            ($3, $4, 'target', 8.00, 20.00, 10.00)
     on conflict (org_id, product_code, scenario)
     do update set margin_pct = excluded.margin_pct`,
    [orgA, productA, orgB, productB],
  );
  await owner.query(
    `insert into public.compliance_docs
       (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, expires_at, expiry_state, uploaded_by_user)
     values ($1, $2, 'Spec', 'Valid spec document', $3, 'application/pdf', 2048, 1, current_date + 30, 'Valid', $4),
            ($5, $6, 'Spec', 'Valid spec document', $7, 'application/pdf', 2048, 1, current_date + 30, 'Valid', $8)
     on conflict (org_id, product_code, doc_type, version_number)
     do update set expires_at = excluded.expires_at, expiry_state = excluded.expiry_state, deleted_at = null`,
    [
      orgA,
      productA,
      `compliance/${productA}/spec.pdf`,
      userA,
      orgB,
      productB,
      `compliance/${productB}/spec.pdf`,
      userB,
    ],
  );
  await owner.query(
    `insert into public.allergen_cascade_rebuild_jobs
       (org_id, product_code, source_event_id, source_event_type, status, processed_at)
     values ($1, $2, $3, 'reference.allergens_by_rm.bulk_changed', 'processed', now()),
            ($4, $5, $6, 'reference.allergens_by_rm.bulk_changed', 'processed', now())
     on conflict (org_id, product_code, source_event_id) do update
       set status = excluded.status,
           processed_at = excluded.processed_at`,
    [orgA, productA, cascadeEventA, orgB, productB, cascadeEventB],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.risks where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.allergen_cascade_rebuild_jobs where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.compliance_docs where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.nutrition_allergens where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.costing_breakdowns where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.nutri_score_results where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.formulations where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.npd_projects where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.product where product_code in ($1, $2)`, [productA, productB]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB]);
  await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
}

run('evaluateApprovalCriteria Server Action — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for seeding/cleanup; action uses withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    const appUrl = new URL(databaseUrl as string);
    appUrl.username = 'app_user';
    appUrl.password = appUserPassword;
    // eslint-disable-next-line no-restricted-syntax -- direct app_user pool for non-vacuous RLS WITH CHECK assertion
    appPool = new pg.Pool({ connectionString: appUrl.toString() });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userA;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgA;
    await seedSatisfiedApprovalRows();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await appPool.end();
    await owner.end();
  });

  it('returns pass/not_required for satisfied inputs loaded through withOrgContext', async () => {
    const { evaluateApprovalCriteria } = await import('../evaluate');

    await expect(evaluateApprovalCriteria(productA)).resolves.toEqual({
      ok: true,
      data: {
        C1: 'pass',
        C2: 'pass',
        C3: 'pass',
        C4: 'not_required',
        C5: 'pass',
        C6: 'pass',
        C7: 'pass',
      },
    });
  });

  it('returns C6 warn when V18 has one Open High risk', async () => {
    const { evaluateApprovalCriteria } = await import('../evaluate');

    await owner.query(
      `insert into public.risks
         (org_id, product_code, title, description, likelihood, impact, state, created_by_user)
       values ($1, $2, 'Open High risk', 'Open high approval blocker', 3, 2, 'Open', $3)`,
      [orgA, productA, userA],
    );

    const result = await evaluateApprovalCriteria(productA);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C6 : null).toBe('warn');
  });

  it('does not see another org product through the action and rejects cross-org WITH CHECK inserts', async () => {
    const { evaluateApprovalCriteria } = await import('../evaluate');

    await expect(evaluateApprovalCriteria(productB)).resolves.toEqual({ ok: false, error: 'not_found' });

    const sessionToken = randomUUID();
    await owner.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)`,
      [sessionToken, orgA],
    );

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      await expect(
        client.query(
          `insert into public.risks
             (org_id, product_code, title, description, likelihood, impact, state, created_by_user)
           values ($1, $2, 'Cross org risk', 'Cross organization write attempt', 1, 1, 'Open', $3)`,
          [orgB, productB, userB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
      await owner.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [
        sessionToken,
      ]);
    }
  });
});
