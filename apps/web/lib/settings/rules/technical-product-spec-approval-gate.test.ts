import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (arg1: unknown, arg2?: unknown) => {
    const action = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof action !== 'function') throw new Error('withOrgContext mock expected an action callback');
    return _withOrgContextRunner(action as (ctx: unknown) => Promise<unknown>);
  }),
}));

const repoRoot = resolve(__dirname, '../../../../..');
const importPath = resolve(repoRoot, 'apps/web/actions/import-export/import.ts');
const withOrgContextPath = resolve(repoRoot, 'apps/web/lib/auth/with-org-context.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const GATE_RULE_CODE = 'technical_product_spec_approval_gate_v1';
const SETTINGS_AUTHORIZATION_EDIT = 'settings.authorization.edit';

type RuleRow = {
  rule_code: string;
  rule_type: 'gate' | 'workflow' | 'conditional' | 'cascading';
  active: boolean | null;
};

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  rules: RuleRow[];
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type ImportModule = {
  startImportJob: (input: {
    target: string;
    fileName: string;
    contentType: string;
    csvText: string;
    auditReason: string;
  }) => Promise<unknown>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient([]);
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
  );
});

describe('technical_product_spec_approval_gate_v1 V-SET-44 authorization preflight', () => {
  it('returns typed blockers for missing, inactive, and wrong-type gate rule definitions before import job creation', async () => {
    expect(existsSync(withOrgContextPath), 'mocked withOrgContext target must exist on disk').toBe(true);
    const { startImportJob } = await loadImportModule();

    const cases: Array<{ label: string; rules: RuleRow[]; expectedCode: string }> = [
      { label: 'missing', rules: [], expectedCode: 'approval_gate_rule_missing' },
      {
        label: 'inactive',
        rules: [{ rule_code: GATE_RULE_CODE, rule_type: 'gate', active: false }],
        expectedCode: 'approval_gate_rule_inactive',
      },
      {
        label: 'wrong type',
        rules: [{ rule_code: GATE_RULE_CODE, rule_type: 'workflow', active: true }],
        expectedCode: 'approval_gate_rule_wrong_type',
      },
    ];

    for (const testCase of cases) {
      currentClient = makeClient(testCase.rules);
      _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
        action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
      );

      const result = await startImportJob(validAuthorizationPolicyImport());

      expect(result, `${testCase.label} rule must fail closed with a typed V-SET-44 blocker`).toMatchObject({
        ok: false,
        error: 'authorization_preflight_failed',
        blockers: [
          expect.objectContaining({
            code: testCase.expectedCode,
            check: 'V-SET-44',
            policyCode: 'technical_product_spec_approval',
          }),
        ],
      });
      expect(jobInsertCalls(), `${testCase.label} rule preflight failure must not create import_export_jobs rows`).toHaveLength(0);
    }
  });
});

async function loadImportModule(): Promise<ImportModule> {
  expect(existsSync(importPath), 'apps/web/actions/import-export/import.ts must exist and export startImportJob(input)').toBe(true);
  const mod = (await import(importPath)) as Partial<ImportModule>;
  if (typeof mod.startImportJob !== 'function') {
    expect.fail('import.ts must export startImportJob(input)');
  }
  return mod as ImportModule;
}

function validAuthorizationPolicyImport() {
  return {
    target: 'authorization_policies',
    fileName: 'authorization-policies.csv',
    contentType: 'text/csv',
    csvText: 'policy_code,is_enabled\ntechnical_product_spec_approval,true\n',
    auditReason: 'bulk policy load approved by owner',
  };
}

function makeClient(rules: RuleRow[]): FakeClient {
  const calls: QueryCall[] = [];
  return {
    calls,
    rules,
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = normalize(sql);

      if (normalized.includes('from public.role_permissions')) {
        return params.includes(SETTINGS_AUTHORIZATION_EDIT) ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from public.org_authorization_policies')) {
        return {
          rows: [
            {
              policy_code: 'technical_product_spec_approval',
              is_enabled: true,
              authorize_permissions: ['technical.product_spec.approve'],
              approver_role_codes: ['technical_manager'],
              requires_new_version: true,
              approval_gate_rule_code: GATE_RULE_CODE,
              min_approvers: 1,
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.rule_definitions')) {
        return { rows: rules, rowCount: rules.length };
      }

      if (normalized.includes('insert into public.import_export_jobs')) {
        return {
          rows: [
            {
              id: 'job-should-not-exist',
              kind: 'import',
              target: 'authorization_policies',
              status: 'queued',
              progress_processed: 0,
              progress_total: 0,
              download_url: null,
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function jobInsertCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => normalize(call.sql).includes('insert into public.import_export_jobs'));
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}
