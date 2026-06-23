import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const PRINTER_ID = '44444444-4444-4444-8444-444444444444';
const TEMPLATE_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';
const ITEM_ID = '77777777-7777-4777-8777-777777777777';
const SOURCE_JOB_ID = '88888888-8888-4888-8888-888888888888';
const NEW_JOB_ID = '99999999-9999-4999-8999-999999999999';
const GS = '\x1d';

type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  calls: QueryCall[];
  canEdit: boolean;
  gs1Gtin: string | null;
  printerType: 'pdf' | 'zpl';
  insertedJobs: number;
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'stub', client: currentClient }),
  );
});

describe('printer server actions', () => {
  it('upsertPrinter writes to printers table', async () => {
    const { upsertPrinter } = await loadActions();

    const result = await upsertPrinter({
      name: 'Dispatch PDF',
      printer_type: 'pdf',
      address: 'pdf://dispatch',
      location: 'Dispatch',
      site_id: SITE_ID,
      is_active: true,
    });

    expect(result.id).toBe(PRINTER_ID);
    expect(result.name).toBe('Dispatch PDF');
    const insert = callContaining('insert into public.printers');
    expect(insert.sql).toContain('app.current_org_id()');
    expect(insert.params).toEqual([SITE_ID, 'Dispatch PDF', 'pdf', 'pdf://dispatch', 'Dispatch', true, USER_ID]);
  });

  it('printLabel for an LP writes print_jobs row with resolved payload and correct status', async () => {
    const { printLabel } = await loadActions();

    const result = await printLabel({
      entityType: 'lp',
      entityId: LP_ID,
      templateId: TEMPLATE_ID,
      printerId: PRINTER_ID,
      copies: 2,
    });

    expect(result.status).toBe('sent');
    expect(result.result_url).toMatch(/^data:text\/plain;charset=utf-8,/);
    expect(result.payload).toMatchObject({
      entity_type: 'lp',
      entity_id: LP_ID,
      lp_code: 'LP-0001',
      item_id: ITEM_ID,
      gs1_gtin: '00614141123452',
      lot: 'LOTA',
      expiry_date: '2026-07-31',
      catch_weight_kg: '12.500000',
      gs1_raw: `010061414112345210LOTA${GS}172607313103012500`,
      gs1_human: '(01)00614141123452(10)LOTA(17)260731(3103)012500',
    });
    expect(result.payload).not.toHaveProperty('gtin_missing');
    expect(result.result_url).toContain(
      encodeURIComponent('"gs1_human": "(01)00614141123452(10)LOTA(17)260731(3103)012500"'),
    );

    const insert = callContaining('insert into public.print_jobs');
    const insertedPayload = JSON.parse(String(insert.params[6])) as Record<string, unknown>;
    expect(insert.sql).toContain('app.current_org_id()');
    expect(insert.params[3]).toBe('lp');
    expect(insert.params[4]).toBe(LP_ID);
    expect(insert.params[5]).toBe(2);
    expect(insert.params[7]).toBe('sent');
    expect(insertedPayload.gs1_raw).toBe(`010061414112345210LOTA${GS}172607313103012500`);
    expect(insertedPayload.gs1_human).toBe('(01)00614141123452(10)LOTA(17)260731(3103)012500');
  });

  it('item without GTIN sets gtin_missing=true without throwing', async () => {
    currentClient = makeClient({ gs1Gtin: null });
    const { printLabel } = await loadActions();

    const result = await printLabel({
      entityType: 'lp',
      entityId: LP_ID,
      printerId: PRINTER_ID,
    });

    expect(result.status).toBe('sent');
    expect(result.payload.gtin_missing).toBe(true);
    expect(result.payload.gs1_gtin).toBeNull();
    expect(result.payload.gs1_raw).toBe(`10LOTA${GS}172607313103012500`);
    expect(result.payload.gs1_human).toBe('(10)LOTA(17)260731(3103)012500');
    const insert = callContaining('insert into public.print_jobs');
    const insertedPayload = JSON.parse(String(insert.params[6])) as Record<string, unknown>;
    expect(insertedPayload.gtin_missing).toBe(true);
    expect(String(insertedPayload.gs1_raw).startsWith('01')).toBe(false);
    expect(insertedPayload.gs1_raw).toBe(`10LOTA${GS}172607313103012500`);
    expect(insertedPayload.gs1_human).toBe('(10)LOTA(17)260731(3103)012500');
    expect(String(insertedPayload.gs1_human)).not.toContain('(01)');
  });

  it('reprintFromHistory clones the job', async () => {
    const { reprintFromHistory } = await loadActions();

    const result = await reprintFromHistory(SOURCE_JOB_ID);

    expect(result.id).toBe(NEW_JOB_ID);
    expect(result.id).not.toBe(SOURCE_JOB_ID);
    expect(result.status).toBe('sent');
    expect(result.payload).toEqual({ lp_code: 'LP-0001', original: true });

    const select = callContaining('from public.print_jobs pj');
    expect(select.sql).toContain('app.current_org_id()');
    const insert = callContaining('insert into public.print_jobs');
    expect(insert.params[1]).toBe(PRINTER_ID);
    expect(insert.params[2]).toBe(TEMPLATE_ID);
    expect(insert.params[3]).toBe('lp');
    expect(insert.params[4]).toBe(LP_ID);
    expect(insert.params[7]).toBe('sent');
  });
});

type ActionsModule = {
  upsertPrinter(input: unknown): Promise<{ id: string; name: string }>;
  printLabel(input: unknown): Promise<{
    id: string;
    status: string;
    result_url: string | null;
    payload: Record<string, unknown>;
  }>;
  reprintFromHistory(jobId: string): Promise<{
    id: string;
    status: string;
    payload: Record<string, unknown>;
  }>;
};

async function loadActions(): Promise<ActionsModule> {
  return (await import('./printers')) as ActionsModule;
}

function makeClient(options: { gs1Gtin?: string | null; printerType?: 'pdf' | 'zpl'; canEdit?: boolean } = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    canEdit: options.canEdit ?? true,
    gs1Gtin: options.gs1Gtin === undefined ? '00614141123452' : options.gs1Gtin,
    printerType: options.printerType ?? 'pdf',
    insertedJobs: 0,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) {
        return client.canEdit ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.startsWith('insert into public.printers')) {
        return {
          rows: [
            {
              id: PRINTER_ID,
              org_id: ORG_ID,
              site_id: params[0],
              name: params[1],
              printer_type: params[2],
              address: params[3],
              location: params[4],
              is_active: params[5],
              created_by: params[6],
              created_at: '2026-06-23T10:00:00.000Z',
              updated_at: '2026-06-23T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (n.includes('from public.printers') && n.includes('is_active = true')) {
        return {
          rows: [{ id: PRINTER_ID, printer_type: client.printerType, site_id: SITE_ID, name: 'Dispatch PDF' }],
          rowCount: 1,
        };
      }

      if (n.includes('from public.license_plates lp') && n.includes('lp.product_id::text as item_id')) {
        return {
          rows: [
            {
              entity_id: LP_ID,
              site_id: SITE_ID,
              lp_code: 'LP-0001',
              item_id: ITEM_ID,
              gs1_gtin: client.gs1Gtin,
              batch_lot: 'LOTA',
              expiry_date: '2026-07-31',
              catch_weight_kg: '12.500000',
            },
          ],
          rowCount: 1,
        };
      }

      if (n.includes('from public.print_jobs pj') && n.includes('p.printer_type')) {
        return {
          rows: [
            {
              id: SOURCE_JOB_ID,
              org_id: ORG_ID,
              site_id: SITE_ID,
              printer_id: PRINTER_ID,
              template_id: TEMPLATE_ID,
              entity_type: 'lp',
              entity_id: LP_ID,
              copies: 3,
              payload: { lp_code: 'LP-0001', original: true },
              status: 'sent',
              error_text: null,
              result_url: 'data:text/plain;charset=utf-8,old',
              created_by: USER_ID,
              created_at: '2026-06-23T09:00:00.000Z',
              updated_at: '2026-06-23T09:00:00.000Z',
              printer_type: client.printerType,
              printer_site_id: SITE_ID,
            },
          ],
          rowCount: 1,
        };
      }

      if (n.startsWith('insert into public.print_jobs')) {
        client.insertedJobs += 1;
        const payload = JSON.parse(String(params[6])) as Record<string, unknown>;
        return {
          rows: [
            {
              id: client.insertedJobs === 1 ? NEW_JOB_ID : `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${client.insertedJobs}`,
              org_id: ORG_ID,
              site_id: params[0],
              printer_id: params[1],
              template_id: params[2],
              entity_type: params[3],
              entity_id: params[4],
              copies: params[5],
              payload,
              status: params[7],
              error_text: null,
              result_url: params[8],
              created_by: params[9],
              created_at: '2026-06-23T10:05:00.000Z',
              updated_at: '2026-06-23T10:05:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function callContaining(fragment: string): QueryCall {
  const call = currentClient.calls.find((candidate) => normalize(candidate.sql).includes(fragment.toLowerCase()));
  expect(call, `Expected SQL call containing ${fragment}`).toBeTruthy();
  return call as QueryCall;
}
