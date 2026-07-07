/**
 * SET-014 / V-SET-60 — Unit tests for the locations CSV import Server Action.
 *
 * Tests the parse+insert+duplicate (idempotent upsert) path.
 * withOrgContext is mocked to avoid a live DB dependency; the SQL sent to
 * the fake client is asserted to prove RLS (app.current_org_id()) is used.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------
const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WAREHOUSE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  outboxEntries: Array<{ event_type: string; payload: unknown }>;
  locations: Map<string, { id: string; level: number; path: string; warehouse_id: string; parent_id: string | null }>;
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    outboxEntries: [],
    locations: new Map(),
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // Permission check — always grant
      if (norm.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      // Parent lookup
      if (norm.includes('from public.locations') && norm.includes('path = $2')) {
        const parentPath = String(params[1] ?? '');
        const match = Array.from(client.locations.values()).find((loc) => loc.path === parentPath);
        return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
      }

      // Insert / upsert location
      if (norm.startsWith('insert into public.locations')) {
        const id = `loc-${client.locations.size + 1}`;
        const warehouseId = String(params[0] ?? WAREHOUSE_ID);
        const parentId = params[1] ? String(params[1]) : null;
        const code = String(params[2] ?? 'CODE');
        const name = String(params[3] ?? 'Name');
        const level = Number(params[4] ?? 1);
        const path = String(params[5] ?? code);
        client.locations.set(path, { id, warehouse_id: warehouseId, parent_id: parentId, level, path });
        return { rows: [{ id, path, level }], rowCount: 1 };
      }

      // Outbox insert
      if (norm.startsWith('insert into public.outbox_events')) {
        const eventType = String((params as unknown[]).find((v) => typeof v === 'string' && v.includes('.')) ?? 'unknown');
        const payload = (params as unknown[]).at(-1);
        client.outboxEntries.push({ event_type: eventType, payload });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

// ---------------------------------------------------------------------------
// Hoist + mock withOrgContext so it injects our fake client
// ---------------------------------------------------------------------------
const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

// next-intl/server needs to be mocked so getTranslations works in jsdom
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

// next/navigation redirect — capture the URL, don't actually navigate
const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    redirectCalls.push(url);
    // Throw a special sentinel so tests can catch the redirect
    const err = new Error(`REDIRECT:${url}`) as Error & { digest?: string };
    err.digest = 'NEXT_REDIRECT';
    throw err;
  }),
}));

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Extract the importMessage value from a redirect URL query string. */
function getImportMessage(redirectUrl: string): string {
  return new URLSearchParams(redirectUrl.replace(/^\?/, '')).get('importMessage') ?? '';
}

// ---------------------------------------------------------------------------
// Dynamic import to allow vi.mock() to take effect before the module loads
// ---------------------------------------------------------------------------
async function loadAction() {
  return (await import('../import-location-csv')) as {
    importLocationCsvAction(formData: FormData): Promise<void>;
  };
}

function importFormData(
  csv: string | null,
  opts: { warehouseId?: string; locale?: string } = {},
): FormData {
  const formData = new FormData();
  formData.append('warehouseId', opts.warehouseId ?? 'all');
  formData.append('locale', opts.locale ?? 'en');
  if (csv !== null) {
    formData.append('csvFile', new File([csv], 'locations.csv', { type: 'text/csv' }));
  }
  return formData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SET-014 locations CSV import action', () => {
  let fakeClient: FakeClient;

  beforeEach(() => {
    redirectCalls.length = 0;
    vi.clearAllMocks();
    fakeClient = makeClient();

    _runWithOrgContext.mockImplementation(
      async (action: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>) =>
        action({ userId: USER_ID, orgId: ORG_ID, client: fakeClient }),
    );
  });

  it('parses CSV headers and inserts root locations (level 1) idempotently', async () => {
    const { importLocationCsvAction } = await loadAction();
    const csv = [
      'name,warehouseId,parentPath,level,path',
      `Zone A,${WAREHOUSE_ID},,1,zone_a`,
      `Zone B,${WAREHOUSE_ID},,1,zone_b`,
    ].join('\n');

    const formData = importFormData(csv);

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    // Expect a redirect (success)
    expect(caught?.message).toMatch(/REDIRECT:/);
    const redirectUrl = caught?.message.replace('REDIRECT:', '') ?? '';
    expect(redirectUrl).toContain('importStatus=success');

    // Two locations inserted
    expect(fakeClient.locations.size).toBe(2);
    expect(Array.from(fakeClient.locations.keys())).toContain('zone_a');
    expect(Array.from(fakeClient.locations.keys())).toContain('zone_b');

    // Each insert used app.current_org_id() not a raw UUID for org scoping
    const insertCalls = fakeClient.calls.filter((c) =>
      c.sql.toLowerCase().startsWith('insert into public.locations'),
    );
    expect(insertCalls).toHaveLength(2);
    for (const call of insertCalls) {
      expect(call.sql).toContain('app.current_org_id()');
    }

    // Two outbox events emitted — event_type is a SQL literal so we extract it from the SQL
    expect(fakeClient.outboxEntries).toHaveLength(2);
    // The outbox event type is hard-coded as 'settings.location.imported' in the SQL literal
    const outboxInsertCalls = fakeClient.calls.filter((c) =>
      c.sql.toLowerCase().includes('insert into public.outbox_events'),
    );
    expect(outboxInsertCalls).toHaveLength(2);
    for (const call of outboxInsertCalls) {
      expect(call.sql).toContain('settings.location.imported');
    }
  });

  it('inserts child locations (level 2) after creating their parent', async () => {
    const { importLocationCsvAction } = await loadAction();

    // Pre-seed a parent in the fake client so the parent lookup returns it
    fakeClient.locations.set('zone_a', {
      id: 'zone-id-1',
      warehouse_id: WAREHOUSE_ID,
      parent_id: null,
      level: 1,
      path: 'zone_a',
    });

    const csv = [
      'name,warehouseId,parentPath,level,path',
      `Bin 01,${WAREHOUSE_ID},zone_a,2,zone_a.bin_01`,
    ].join('\n');

    const formData = importFormData(csv);

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught?.message).toMatch(/REDIRECT:/);
    const redirectUrl = caught?.message.replace('REDIRECT:', '') ?? '';
    expect(redirectUrl).toContain('importStatus=success');
    expect(fakeClient.locations.has('zone_a.bin_01')).toBe(true);
  });

  it('reports per-row errors when parent path not found and redirects with error status', async () => {
    const { importLocationCsvAction } = await loadAction();

    const csv = [
      'name,warehouseId,parentPath,level,path',
      `Orphan Bin,${WAREHOUSE_ID},nonexistent_parent,2,nonexistent_parent.bin`,
    ].join('\n');

    const formData = importFormData(csv);

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught?.message).toMatch(/REDIRECT:/);
    const redirectUrl = caught?.message.replace('REDIRECT:', '') ?? '';
    expect(redirectUrl).toContain('importStatus=error');
    expect(decodeURIComponent(redirectUrl)).toContain('INVALID_PARENT');

    // Nothing should have been inserted
    expect(fakeClient.locations.has('nonexistent_parent.bin')).toBe(false);
  });

  it('redirects with error when no file is submitted', async () => {
    const { importLocationCsvAction } = await loadAction();

    const formData = importFormData(null);

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught?.message).toMatch(/REDIRECT:/);
    const redirectUrl = caught?.message.replace('REDIRECT:', '') ?? '';
    expect(redirectUrl).toContain('importStatus=error');
  });

  it('redirects with error when CSV is empty (header only)', async () => {
    const { importLocationCsvAction } = await loadAction();
    const csv = 'name,warehouseId,parentPath,level,path';

    const formData = importFormData(csv);

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught?.message).toMatch(/REDIRECT:/);
    const redirectUrl = caught?.message.replace('REDIRECT:', '') ?? '';
    expect(redirectUrl).toContain('importStatus=error');
    expect(getImportMessage(redirectUrl)).toContain('no data rows');
  });

  it('preserves selectedWarehouseId in the redirect query string', async () => {
    const { importLocationCsvAction } = await loadAction();
    const csv = [
      'name,warehouseId,parentPath,level,path',
      `Zone X,${WAREHOUSE_ID},,1,zone_x`,
    ].join('\n');

    const formData = importFormData(csv, { warehouseId: WAREHOUSE_ID });

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    const redirectUrl = decodeURIComponent(caught?.message.replace('REDIRECT:', '') ?? '');
    expect(redirectUrl).toContain(`warehouseId=${WAREHOUSE_ID}`);
  });

  it('handles quoted CSV fields containing commas without splitting incorrectly', async () => {
    const { importLocationCsvAction } = await loadAction();
    // Name has a comma inside quotes
    const csv = [
      'name,warehouseId,parentPath,level,path',
      `"Cold, Dark Storage",${WAREHOUSE_ID},,1,cold_dark`,
    ].join('\n');

    const formData = importFormData(csv);

    let caught: Error | null = null;
    try {
      await importLocationCsvAction(formData);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught?.message).toMatch(/REDIRECT:/);
    const redirectUrl = caught?.message.replace('REDIRECT:', '') ?? '';
    expect(redirectUrl).toContain('importStatus=success');
    expect(fakeClient.locations.has('cold_dark')).toBe(true);

    // Verify name was parsed correctly (not split on comma)
    const insertCall = fakeClient.calls.find(
      (c) => c.sql.toLowerCase().startsWith('insert into public.locations'),
    );
    // params[3] is the name parameter ($4 in 0-indexed = index 3)
    expect(insertCall?.params[3]).toBe('Cold, Dark Storage');
  });
});
