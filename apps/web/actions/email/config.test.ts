import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROBE_TO = 'ops@example.com';

const { _withOrgContextRunner, _resendSend } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _resendSend: vi.fn(),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: _resendSend },
  })),
}));

type QueryCall = { sql: string; params: readonly unknown[] };
type AuditRow = { action: string; resource_id: string; after_state: unknown };
type EmailConfigInput = {
  triggerCode: string;
  recipientsTo: string;
  recipientsCc?: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
  expectedVersion?: number;
};
type EmailActionResult =
  | { status: 'ok'; message_id?: string; data?: unknown }
  | { status: 'error'; code: string; message?: string };
type FakeClient = {
  calls: QueryCall[];
  auditRows: AuditRow[];
  referenceRows: Array<Record<string, unknown>>;
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
  _resendSend.mockResolvedValue({ data: { id: 'email_probe_123' }, error: null });
});

describe('email_config Server Actions (T-031 RED)', () => {
  it('V-SET-70 rejects activating email_config with empty recipients_to before any write', async () => {
    const upsertEmailConfig = await loadAction<
      (input: EmailConfigInput) => Promise<EmailActionResult>
    >('upsert-config.ts', 'upsertEmailConfig', () => import(`${__dirname}/upsert-config.ts`) as Promise<Record<string, unknown>>);

    const result = await upsertEmailConfig({
      triggerCode: 'core_closed',
      recipientsTo: ' ;  ; ',
      subjectTemplate: 'Core closed {{fa_code}}',
      bodyTemplate: 'Closed {{fa_code}} for {{dept}}',
      isActive: true,
      expectedVersion: 1,
    });

    expect(result).toMatchObject({ status: 'error', code: 'RECIPIENTS_EMPTY' });
    expect(writeCalls(), 'RECIPIENTS_EMPTY must fail before reference/audit writes').toHaveLength(0);
  });

  it('V-SET-71 rejects Mustache variables absent from the trigger payload schema before any write', async () => {
    const upsertEmailConfig = await loadAction<
      (input: EmailConfigInput) => Promise<EmailActionResult>
    >('upsert-config.ts', 'upsertEmailConfig', () => import(`${__dirname}/upsert-config.ts`) as Promise<Record<string, unknown>>);

    const result = await upsertEmailConfig({
      triggerCode: 'fa_d365_ready',
      recipientsTo: 'finance@example.com',
      recipientsCc: '',
      subjectTemplate: 'D365 ready {{fa_code}}',
      bodyTemplate: 'FA {{fa_code}} is ready; unknown {{not_in_payload_schema}}',
      isActive: true,
      expectedVersion: 1,
    });

    expect(result).toMatchObject({ status: 'error', code: 'UNKNOWN_TEMPLATE_VAR' });
    expect(writeCalls(), 'UNKNOWN_TEMPLATE_VAR must fail before reference/audit writes').toHaveLength(0);
  });

  it('V-SET-72 sends a Resend probe and writes audit only on success; auth failure returns PROVIDER_AUTH_FAILED without audit', async () => {
    const testEmailProvider = await loadAction<
      (input: { to: string }) => Promise<EmailActionResult>
    >('test-provider.ts', 'testEmailProvider', () => import(`${__dirname}/test-provider.ts`) as Promise<Record<string, unknown>>);

    const ok = await testEmailProvider({ to: PROBE_TO });

    expect(ok).toMatchObject({ status: 'ok', message_id: 'email_probe_123' });
    expect(_resendSend).toHaveBeenCalledWith(expect.objectContaining({ to: [PROBE_TO] }));
    expect(currentClient.auditRows, 'successful provider test must write exactly one audit row').toHaveLength(1);
    expect(currentClient.auditRows[0]?.action).toBe('email.provider.test');

    currentClient = makeClient();
    _resendSend.mockRejectedValueOnce(Object.assign(new Error('mock Resend auth failed'), { statusCode: 401 }));
    const authFailed = await testEmailProvider({ to: PROBE_TO });

    expect(authFailed).toMatchObject({ status: 'error', code: 'PROVIDER_AUTH_FAILED' });
    expect(currentClient.auditRows, 'invalid provider credentials must not write audit rows').toHaveLength(0);
  });
});

async function loadAction<T extends (...args: never[]) => unknown>(
  moduleLabel: string,
  exportName: string,
  importer: () => Promise<Record<string, unknown>>,
): Promise<T> {
  try {
    const mod = await importer();
    const action = mod[exportName];
    if (typeof action !== 'function') {
      expect.fail(`EmailConfig RED contract: ${moduleLabel} must export ${exportName} Server Action`);
    }
    return action as T;
  } catch {
    expect.fail(`EmailConfig RED contract: ${moduleLabel} must be implemented and export ${exportName} Server Action`);
  }
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    auditRows: [],
    referenceRows: [],
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };
      if (normalized.includes('from public.reference_schemas')) {
        return {
          rows: [
            { column_code: 'trigger_code', enum_values: ['core_closed', 'fa_d365_ready'] },
            { column_code: 'recipients_to' },
            { column_code: 'subject_template' },
            { column_code: 'body_template' },
            { column_code: 'is_active', enum_values: ['true', 'false'] },
          ] as T[],
          rowCount: 5,
        };
      }
      if (normalized.includes('from public.integration_settings') || normalized.includes('from public.org_integrations')) {
        return { rows: [{ provider: 'resend', api_key_vault_ref: 'vault://email/resend/test' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('vault') || normalized.includes('secret')) {
        return { rows: [{ secret_value: '[REDACTED_TEST_RESEND_KEY]' }] as T[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.reference_tables') || normalized.startsWith('update public.reference_tables')) {
        client.referenceRows.push({ params });
        return { rows: [{ row_key: 'fa_d365_ready', row_data: params[3] ?? {}, version: 2 }] as T[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.audit_log') || normalized.startsWith('insert into public.audit_events')) {
        client.auditRows.push({
          action: String(params[2] ?? params[1] ?? ''),
          resource_id: String(params[3] ?? ''),
          after_state: params[5] ?? params[4] ?? null,
        });
        return { rows: [{ id: `audit-${client.auditRows.length}` }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
  return client;
}

function writeCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => /^(insert|update|delete)\s/i.test(call.sql.trim()));
}
