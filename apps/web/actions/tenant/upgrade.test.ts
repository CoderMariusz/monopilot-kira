import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../..');
const withOrgContextPath = resolve(repoRoot, 'apps/web/lib/auth/with-org-context.ts');
const previewUpgradePath = resolve(repoRoot, 'apps/web/actions/tenant/preview-upgrade.ts');
const startUpgradePath = resolve(repoRoot, 'apps/web/actions/tenant/start-upgrade.ts');
const rollbackUpgradePath = resolve(repoRoot, 'apps/web/actions/tenant/rollback-upgrade.ts');
const promoteCanaryPath = resolve(repoRoot, 'apps/web/actions/tenant/promote-canary.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MIGRATION_ID = '33333333-3333-4333-8333-333333333333';
const EXPIRED_MIGRATION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-05-19T12:00:00.000Z');

type ActionResult<TData> = { ok: true; data: TData } | { ok: false; error: string; message?: string; supportTicketRequired?: boolean };
type QueryCall = { sql: string; params: unknown[] };
type MigrationRow = {
  id: string;
  component: string;
  current_version: string;
  target_version: string;
  status: string;
  canary_pct: number;
  completed_at: string;
};
type RuleDefinitionRow = {
  rule_code: string;
  version: number;
  definition_json: Record<string, unknown>;
};
type FakeClient = {
  calls: QueryCall[];
  migrations: Map<string, MigrationRow>;
  ruleDefinitions: RuleDefinitionRow[];
  affectedRulesCount: number;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type PreviewUpgradeModule = {
  previewUpgrade: (input: { component: string; targetVersion: string }) => Promise<ActionResult<{
    component: string;
    targetVersion: string;
    affectedRows: number;
    diff: Record<string, unknown>;
  }>>;
};

type StartUpgradeModule = {
  startUpgrade: (input: {
    component: string;
    targetVersion: string;
    targetRegion?: string;
    reason?: string;
  }) => Promise<ActionResult<{ migrationId: string; status: string }>>;
};

type RollbackUpgradeModule = {
  rollbackUpgrade: (input: { migrationId: string; reason?: string }) => Promise<ActionResult<{
    migrationId: string;
    status: 'rolled_back';
  }>>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('tenant upgrade orchestration Server Actions (T-028 PRD §9.4 / V-SET-32..33)', () => {
  it('previewUpgrade computes a real JSON diff from rule_definitions plus affected count, without mock-injected diffs', async () => {
    expect(existsSync(withOrgContextPath), 'withOrgContext helper must exist on disk before it is mocked').toBe(true);
    const { previewUpgrade } = await loadPreviewUpgrade();

    const result = await previewUpgrade({ component: 'rule_engine', targetVersion: 'v2' });

    expect(result).toEqual({
      ok: true,
      data: {
        component: 'rule_engine',
        targetVersion: 'v2',
        affectedRows: 42,
        diff: {
          fromVersion: 'v1',
          toVersion: 'v2',
          changes: [
            { path: 'rules.qa.release_gate.threshold', before: 0.95, after: 0.98 },
          ],
        },
      },
    });
    expect(_withOrgContextRunner).toHaveBeenCalledTimes(1);
    expect(statementIndex('public.tenant_migrations')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('public.rule_definitions')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('insert into public.tenant_migrations')).toBe(-1);
    expect(statementIndex('update public.tenant_migrations')).toBe(-1);
    // Reject the previous false-green: production SQL must not synthesize an empty changes array.
    const previewSrc = readFileSync(previewUpgradePath, 'utf8');
    expect(previewSrc).not.toMatch(/jsonb_build_array\s*\(\s*\)/);
    expect(previewSrc).not.toMatch(/affected rows for upgrade preview/);
  });

  it('startUpgrade blocks post-onboarding region changes with REGION_CHANGE_BLOCKED (V-SET-32) before persistence', async () => {
    expect(existsSync(withOrgContextPath), 'withOrgContext helper must exist on disk before it is mocked').toBe(true);
    const { startUpgrade } = await loadStartUpgrade();

    const result = await startUpgrade({
      component: 'rule_engine',
      targetVersion: 'v2',
      targetRegion: 'us',
      reason: 'operator tried to move an onboarded tenant to another region',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'REGION_CHANGE_BLOCKED',
      supportTicketRequired: true,
    });
    expect(result.ok === false ? result.message ?? '' : '').toMatch(/support ticket/i);
    expect(statementIndex('insert into public.tenant_migrations')).toBe(-1);
    expect(statementIndex('update public.tenant_migrations')).toBe(-1);
    expect(statementIndex('insert into public.outbox_events')).toBe(-1);
  });

  it('rollbackUpgrade rolls back completed canaries within 7 days (real SQL state mutation, no fixture hacks), and refuses stale rollback windows', async () => {
    expect(existsSync(withOrgContextPath), 'withOrgContext helper must exist on disk before it is mocked').toBe(true);
    const { rollbackUpgrade } = await loadRollbackUpgrade();

    const rolledBack = await rollbackUpgrade({
      migrationId: MIGRATION_ID,
      reason: 'canary showed validation regressions',
    });

    expect(rolledBack).toEqual({ ok: true, data: { migrationId: MIGRATION_ID, status: 'rolled_back' } });
    // The status flip must come from the real SQL UPDATE round-trip — not a side-channel mutation of fixture state.
    expect(currentClient.migrations.get(MIGRATION_ID)?.status).toBe('rolled_back');
    const updateIndex = statementIndex('update public.tenant_migrations');
    const outboxIndex = statementIndex('insert into public.outbox_events');
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(outboxIndex).toBeGreaterThan(updateIndex);
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain('settings.upgrade.rolled_back');
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain(ORG_ID);
    expect(callBlob(currentClient.calls[outboxIndex]!)).toContain(MIGRATION_ID);

    const callCountBeforeExpiredAttempt = currentClient.calls.length;
    const stale = await rollbackUpgrade({
      migrationId: EXPIRED_MIGRATION_ID,
      reason: 'try to bypass the 7-day rollback window',
    });

    expect(stale).toMatchObject({ ok: false, error: 'rollback_window_expired' });
    expect(currentClient.migrations.get(EXPIRED_MIGRATION_ID)?.status).toBe('completed');
    expect(
      currentClient.calls.slice(callCountBeforeExpiredAttempt).some((call) =>
        normalizeSql(call.sql).includes('update public.tenant_migrations'),
      ),
    ).toBe(false);
  });

  it('production sources are free of test-coupling hacks (no markUnitTestFakeMigrationRolledBack, no fake fixture mutation helpers)', () => {
    const sources = [
      readFileSync(previewUpgradePath, 'utf8'),
      readFileSync(startUpgradePath, 'utf8'),
      readFileSync(rollbackUpgradePath, 'utf8'),
      readFileSync(promoteCanaryPath, 'utf8'),
    ];
    for (const src of sources) {
      expect(src).not.toMatch(/markUnitTestFake/);
      expect(src).not.toMatch(/UnitTest|FakeMigration|FakeClient|fakeMigration|fixture\b/i);
      expect(src).not.toMatch(/compatibility token|V-SET-\d+ tests?/i);
    }
  });
});

async function loadPreviewUpgrade(): Promise<PreviewUpgradeModule> {
  expect(
    existsSync(previewUpgradePath),
    'apps/web/actions/tenant/preview-upgrade.ts must exist and export previewUpgrade(input)',
  ).toBe(true);
  const mod = (await import(previewUpgradePath)) as Partial<PreviewUpgradeModule>;
  if (typeof mod.previewUpgrade !== 'function') {
    expect.fail('apps/web/actions/tenant/preview-upgrade.ts must export previewUpgrade(input)');
  }
  return mod as PreviewUpgradeModule;
}

async function loadStartUpgrade(): Promise<StartUpgradeModule> {
  expect(
    existsSync(startUpgradePath),
    'apps/web/actions/tenant/start-upgrade.ts must exist and export startUpgrade(input)',
  ).toBe(true);
  const mod = (await import(startUpgradePath)) as Partial<StartUpgradeModule>;
  if (typeof mod.startUpgrade !== 'function') {
    expect.fail('apps/web/actions/tenant/start-upgrade.ts must export startUpgrade(input)');
  }
  return mod as StartUpgradeModule;
}

async function loadRollbackUpgrade(): Promise<RollbackUpgradeModule> {
  expect(
    existsSync(rollbackUpgradePath),
    'apps/web/actions/tenant/rollback-upgrade.ts must exist and export rollbackUpgrade(input)',
  ).toBe(true);
  const mod = (await import(rollbackUpgradePath)) as Partial<RollbackUpgradeModule>;
  if (typeof mod.rollbackUpgrade !== 'function') {
    expect.fail('apps/web/actions/tenant/rollback-upgrade.ts must export rollbackUpgrade(input)');
  }
  return mod as RollbackUpgradeModule;
}

function makeClient(): FakeClient {
  const migrations = new Map<string, MigrationRow>([
    [
      MIGRATION_ID,
      {
        id: MIGRATION_ID,
        component: 'rule_engine',
        target_version: 'v2',
        current_version: 'v1',
        status: 'completed',
        canary_pct: 10,
        completed_at: '2026-05-15T12:00:00.000Z',
      },
    ],
    [
      EXPIRED_MIGRATION_ID,
      {
        id: EXPIRED_MIGRATION_ID,
        component: 'rule_engine',
        target_version: 'v2',
        current_version: 'v1',
        status: 'completed',
        canary_pct: 10,
        completed_at: '2026-05-01T12:00:00.000Z',
      },
    ],
  ]);
  // Real per-version rule_definitions rows. Production code must derive the diff
  // by comparing JSON between versions; the fixture never short-circuits the diff.
  const ruleDefinitions: RuleDefinitionRow[] = [
    { rule_code: 'qa.release_gate', version: 1, definition_json: { threshold: 0.95 } },
    { rule_code: 'qa.release_gate', version: 2, definition_json: { threshold: 0.98 } },
  ];
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    migrations,
    ruleDefinitions,
    affectedRulesCount: 42,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('user_roles') || normalized.includes('role_permissions') || normalized.includes('from public.roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (normalized.includes('from public.organizations') || normalized.includes('from public.tenants')) {
        return { rows: [{ id: ORG_ID, region: 'eu', region_cluster: 'eu', onboarding_completed_at: '2026-01-01T00:00:00.000Z' }], rowCount: 1 };
      }

      if (
        normalized.includes('from public.tenant_migrations')
        && normalized.includes('component')
        && !params.includes(MIGRATION_ID)
        && !params.includes(EXPIRED_MIGRATION_ID)
      ) {
        return { rows: [{ component: 'rule_engine', current_version: 'v1', target_version: 'v1', status: 'completed' }], rowCount: 1 };
      }

      if (normalized.includes('from public.tenant_migrations') && params.includes(MIGRATION_ID)) {
        return { rows: [migrations.get(MIGRATION_ID)!], rowCount: 1 };
      }

      if (normalized.includes('from public.tenant_migrations') && params.includes(EXPIRED_MIGRATION_ID)) {
        return { rows: [migrations.get(EXPIRED_MIGRATION_ID)!], rowCount: 1 };
      }

      // Count of all rule_definitions matching the component (affected_rows).
      if (normalized.includes('from public.rule_definitions') && normalized.includes('count(')) {
        return { rows: [{ affected_rows: client.affectedRulesCount }], rowCount: 1 };
      }

      // Real per-version rule_definitions for diff computation.
      if (normalized.includes('from public.rule_definitions')) {
        return { rows: ruleDefinitions, rowCount: ruleDefinitions.length };
      }

      if (normalized.includes('update public.tenant_migrations')) {
        const migrationId = params.find((param) => param === MIGRATION_ID || param === EXPIRED_MIGRATION_ID) as string | undefined;
        if (migrationId) {
          const migration = migrations.get(migrationId);
          if (migration && migration.status === 'completed') {
            migration.status = 'rolled_back';
            return { rows: [{ id: migrationId, status: 'rolled_back' }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.tenant_migrations')) {
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666', status: 'scheduled' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function statementIndex(fragment: string): number {
  return currentClient.calls.findIndex((call) => normalizeSql(call.sql).includes(fragment.toLowerCase()));
}

function callBlob(call: QueryCall): string {
  return `${normalizeSql(call.sql)} ${JSON.stringify(call.params)}`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
