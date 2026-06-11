import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readOrgDocumentSettings, updateOrgDocumentSettings } from './documents';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let client: QueryClient;
let permissions = new Set<string>(['settings.org.read', 'settings.infra.update']);

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    doc_type: 'po',
    number_prefix: 'PO',
    number_date_part: 'YYYYMM',
    number_seq_padding: 4,
    next_seq: '12',
    archive_after_days: 30,
    updated_at: '2026-06-11T10:00:00.000Z',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        const permission = String(params[2]);
        return { rows: permissions.has(permission) ? [{ ok: true }] : [], rowCount: permissions.has(permission) ? 1 : 0 };
      }
      if (normalized.startsWith('select doc_type')) {
        return { rows: [row(), row({ doc_type: 'to', number_prefix: 'TO' }), row({ doc_type: 'wo', number_prefix: 'WO' })], rowCount: 3 };
      }
      if (normalized.startsWith('update public.org_document_settings')) {
        return {
          rows: [
            row({
              doc_type: params[0],
              number_prefix: params[1],
              number_date_part: params[2],
              number_seq_padding: params[3],
              archive_after_days: params[4],
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('settings document actions', () => {
  beforeEach(() => {
    permissions = new Set<string>(['settings.org.read', 'settings.infra.update']);
    client = makeClient();
  });

  it('reads org document settings behind settings.org.read', async () => {
    const result = await readOrgDocumentSettings();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.settings).toHaveLength(3);
    expect(result.settings[0]).toEqual(expect.objectContaining({ docType: 'po', numberPrefix: 'PO', archiveAfterDays: 30 }));
  });

  it('updates validated document settings behind settings.infra.update', async () => {
    const result = await updateOrgDocumentSettings({
      docType: 'wo',
      numberPrefix: 'JOB',
      numberDatePart: 'YYYY',
      numberSeqPadding: 5,
      archiveAfterDays: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.setting).toEqual(expect.objectContaining({ docType: 'wo', numberPrefix: 'JOB', numberDatePart: 'YYYY', archiveAfterDays: null }));
  });

  it('rejects invalid update payloads before querying', async () => {
    await expect(
      updateOrgDocumentSettings({
        docType: 'po',
        numberPrefix: '',
        numberDatePart: 'YYYYMM',
        numberSeqPadding: 2,
        archiveAfterDays: 0,
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects callers without the update permission', async () => {
    permissions = new Set<string>(['settings.org.read']);

    await expect(
      updateOrgDocumentSettings({
        docType: 'po',
        numberPrefix: 'PO',
        numberDatePart: 'YYYYMM',
        numberSeqPadding: 4,
        archiveAfterDays: 30,
      }),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
  });
});
