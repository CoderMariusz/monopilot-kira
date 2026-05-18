import { existsSync } from 'node:fs';
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
const toggleModulePath = resolve(repoRoot, 'apps/web/actions/modules/toggle.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const MODULE_GRAPH = [
  { code: '00-foundation', name: 'Foundation', dependencies: [], can_disable: false, phase: 1 },
  { code: '01-npd', name: 'NPD', dependencies: ['00-foundation', '02-settings'], can_disable: true, phase: 1 },
  { code: '02-settings', name: 'Settings', dependencies: ['00-foundation'], can_disable: false, phase: 1 },
  { code: '03-technical', name: 'Technical', dependencies: ['00-foundation', '02-settings'], can_disable: true, phase: 1 },
  { code: '04-planning-basic', name: 'Planning Basic', dependencies: ['00-foundation', '02-settings', '03-technical'], can_disable: true, phase: 1 },
  { code: '05-warehouse', name: 'Warehouse', dependencies: ['00-foundation', '02-settings', '03-technical'], can_disable: true, phase: 1 },
  { code: '06-scanner-p1', name: 'Scanner P1', dependencies: ['05-warehouse'], can_disable: true, phase: 1 },
  { code: '07-planning-ext', name: 'Planning Ext', dependencies: ['04-planning-basic'], can_disable: true, phase: 2 },
  { code: '08-production', name: 'Production', dependencies: ['04-planning-basic', '05-warehouse'], can_disable: true, phase: 1 },
  { code: '09-quality', name: 'Quality', dependencies: ['08-production'], can_disable: true, phase: 2 },
  { code: '10-finance', name: 'Finance', dependencies: ['08-production'], can_disable: true, phase: 2 },
  { code: '11-shipping', name: 'Shipping', dependencies: ['05-warehouse', '08-production'], can_disable: true, phase: 2 },
  { code: '12-reporting', name: 'Reporting', dependencies: ['01-npd', '08-production', '10-finance'], can_disable: true, phase: 2 },
  { code: '13-maintenance', name: 'Maintenance', dependencies: ['03-technical'], can_disable: true, phase: 2 },
  { code: '14-multi-site', name: 'Multi Site', dependencies: [], can_disable: true, phase: 3 },
  { code: '15-oee', name: 'OEE', dependencies: ['08-production'], can_disable: true, phase: 3 },
] as const;

const BASE_ENABLED = new Map<string, boolean>([
  ['00-foundation', true],
  ['01-npd', true],
  ['02-settings', true],
  ['03-technical', true],
  ['04-planning-basic', true],
  ['05-warehouse', true],
  ['06-scanner-p1', true],
  ['07-planning-ext', false],
  ['08-production', true],
  ['09-quality', false],
  ['10-finance', false],
  ['11-shipping', false],
  ['12-reporting', false],
  ['13-maintenance', false],
  ['14-multi-site', false],
  ['15-oee', false],
]);

type ToggleModuleResult =
  | { ok: true; data: { moduleCode: string; enabled: boolean } }
  | { ok: false; error: string; blockingModules?: string[] };

type ToggleModule = {
  toggleModule: (input: {
    moduleCode: string;
    enabled: boolean;
    force?: boolean;
    auditReason?: string;
  }) => Promise<ToggleModuleResult>;
};

type QueryCall = { sql: string; params: unknown[] };

type FakeClient = {
  calls: QueryCall[];
  enabledByModule: Map<string, boolean>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient(BASE_ENABLED);
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('toggleModule Server Action (TASK-000102/T-019 RED)', () => {
  it('blocks disabling a module when any enabled downstream reverse dependency exists in the 15-module graph', async () => {
    expect(
      MODULE_GRAPH.filter((module) => module.code !== '00-foundation'),
      '§10.1 has 15 tenant-toggleable modules plus 00-foundation as a non-toggleable core anchor',
    ).toHaveLength(15);
    currentClient.enabledByModule.set('04-planning-basic', false);
    currentClient.enabledByModule.set('05-warehouse', false);
    currentClient.enabledByModule.set('08-production', true);

    const { toggleModule } = await loadToggleModule();
    const result = await toggleModule({ moduleCode: '03-technical', enabled: false });

    expect(result).toEqual({
      ok: false,
      error: 'dependency_enabled',
      blockingModules: ['08-production'],
    });
    expect(statementIndex('update public.organization_modules')).toBe(-1);
    expect(statementIndex('insert into public.outbox_events')).toBe(-1);
  });

  it('enables a valid module and emits a settings.module.enabled outbox event for the org', async () => {
    const { toggleModule } = await loadToggleModule();
    const result = await toggleModule({ moduleCode: '09-quality', enabled: true });

    expect(result).toEqual({ ok: true, data: { moduleCode: '09-quality', enabled: true } });
    expect(currentClient.enabledByModule.get('09-quality')).toBe(true);
    const outbox = outboxCall();
    expect(callBlob(outbox)).toContain('settings.module.enabled');
    expect(callBlob(outbox)).toContain(ORG_ID);
    expect(callBlob(outbox)).toContain('09-quality');
  });

  it('force-disables a module with enabled dependents only when force=true and records the audit reason', async () => {
    const auditReason = 'operator accepted temporary quality-module outage for maintenance';
    const { toggleModule } = await loadToggleModule();
    const result = await toggleModule({
      moduleCode: '08-production',
      enabled: false,
      force: true,
      auditReason,
    });

    expect(result).toEqual({ ok: true, data: { moduleCode: '08-production', enabled: false } });
    expect(currentClient.enabledByModule.get('08-production')).toBe(false);
    const outbox = outboxCall();
    expect(callBlob(outbox)).toContain('settings.module.disabled');
    expect(callBlob(outbox)).toContain('force');
    expect(callBlob(outbox)).toContain('true');
    expect(callBlob(outbox)).toContain(auditReason);
  });

  it('never disables non-disableable core modules even when force=true', async () => {
    const { toggleModule } = await loadToggleModule();
    const result = await toggleModule({
      moduleCode: '02-settings',
      enabled: false,
      force: true,
      auditReason: 'must not override can_disable=false core module',
    });

    expect(result).toEqual({ ok: false, error: 'module_not_disableable' });
    expect(currentClient.enabledByModule.get('02-settings')).toBe(true);
    expect(statementIndex('update public.organization_modules')).toBe(-1);
    expect(statementIndex('insert into public.outbox_events')).toBe(-1);
  });
});

async function loadToggleModule(): Promise<ToggleModule> {
  expect(
    existsSync(toggleModulePath),
    'apps/web/actions/modules/toggle.ts must exist and export toggleModule(input)',
  ).toBe(true);

  const mod = (await import(toggleModulePath)) as Partial<ToggleModule>;
  if (typeof mod.toggleModule !== 'function') {
    expect.fail('apps/web/actions/modules/toggle.ts must export toggleModule(input)');
  }
  return mod as ToggleModule;
}

function makeClient(seed: Map<string, boolean>): FakeClient {
  const calls: QueryCall[] = [];
  const enabledByModule = new Map(seed);
  const client: FakeClient = {
    calls,
    enabledByModule,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('from public.modules') || normalized.includes('from modules')) {
        const requested = params.find((param): param is string => typeof param === 'string' && param.includes('-'));
        const rows = requested ? MODULE_GRAPH.filter((module) => module.code === requested) : [...MODULE_GRAPH];
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('from public.organization_modules') || normalized.includes('from organization_modules')) {
        const requestedCodes = params.flatMap((param) => (Array.isArray(param) ? param : [param])).filter(
          (param): param is string => typeof param === 'string' && param.includes('-'),
        );
        let rows = Array.from(enabledByModule.entries()).map(([module_code, enabled]) => ({
          org_id: ORG_ID,
          module_code,
          enabled,
        }));
        if (requestedCodes.length > 0) rows = rows.filter((row) => requestedCodes.includes(row.module_code));
        if (/enabled\s*=\s*(true|\$\d+)/i.test(sql)) rows = rows.filter((row) => row.enabled);
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('update public.organization_modules') || normalized.includes('update organization_modules')) {
        const moduleCode = params.find((param): param is string => typeof param === 'string' && param.includes('-'));
        const enabled = params.find((param): param is boolean => typeof param === 'boolean');
        if (moduleCode && typeof enabled === 'boolean') {
          enabledByModule.set(moduleCode, enabled);
          return { rows: [{ module_code: moduleCode, enabled }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('insert into public.outbox_events') || normalized.includes('insert into outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('from public.roles') || normalized.includes('from roles') || normalized.includes('user_roles')) {
        return { rows: [{ slug: 'org.access.admin' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function statementIndex(fragment: string): number {
  const lowerFragment = fragment.toLowerCase();
  return currentClient.calls.findIndex((call) => call.sql.replace(/\s+/g, ' ').toLowerCase().includes(lowerFragment));
}

function outboxCall(): QueryCall {
  const index = statementIndex('insert into public.outbox_events');
  expect(index, 'toggleModule must write an outbox event transactionally').toBeGreaterThanOrEqual(0);
  return currentClient.calls[index]!;
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}
