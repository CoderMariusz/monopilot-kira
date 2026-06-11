import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * W9-L5 FIX 1 — regression for the 2026-06-11 live-clickthrough dead-end (§1):
 * EVERY save on /settings/reference (allergens_reference, uom_reference,
 * currency_reference, country_iso_reference) failed with a bare
 * `invalid_input` and the four universal tables were unfillable.
 *
 * Root cause: NO reference_schemas rows were ever seeded for those four
 * table codes (only processes/partners — migrations 073/074), so
 * validateAgainstGeneratedSchema rejected every write with
 * 'reference schema is not configured', surfaced as a naked code.
 *
 * Fixed by migration 286 (universal org_id-IS-NULL schema rows, mirrored in
 * UNIVERSAL_TABLE_SCHEMAS below) + the upsert action / screen now surfacing
 * the failing FIELD in `message`.
 *
 * The fake client is SQL-faithful for the schema lookup (same contract as
 * upsert-schema-resolution.test.ts).
 */

const ORG_ID = '00000000-0000-0000-0000-000000000002';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';

type SchemaSeed = {
  org_id: string | null;
  table_code: string;
  column_code: string;
  data_type: string;
  required_for_done: boolean;
  validation_json: Record<string, unknown>;
};

// Mirrors packages/db/migrations/286-universal-reference-schemas.sql exactly.
const UNIVERSAL_TABLE_SCHEMAS: SchemaSeed[] = [
  { org_id: null, table_code: 'reference.allergens_reference', column_code: 'allergen_code', data_type: 'text', required_for_done: true, validation_json: { required: true, pattern: '^[A-Z0-9_\\-]{2,32}$' } },
  { org_id: null, table_code: 'reference.allergens_reference', column_code: 'display_name', data_type: 'text', required_for_done: true, validation_json: { required: true } },
  { org_id: null, table_code: 'reference.allergens_reference', column_code: 'eu_disclosure_text', data_type: 'text', required_for_done: false, validation_json: { required: false } },
  { org_id: null, table_code: 'reference.allergens_reference', column_code: 'risk_level', data_type: 'enum', required_for_done: false, validation_json: { required: false, enum_values: ['major', 'moderate', 'low'] } },
  { org_id: null, table_code: 'reference.allergens_reference', column_code: 'is_enabled', data_type: 'text', required_for_done: false, validation_json: { required: false } },
  { org_id: null, table_code: 'reference.uom_reference', column_code: 'code', data_type: 'text', required_for_done: true, validation_json: { required: true, pattern: '^[A-Za-z0-9_\\-]{1,16}$' } },
  { org_id: null, table_code: 'reference.uom_reference', column_code: 'name', data_type: 'text', required_for_done: true, validation_json: { required: true } },
  { org_id: null, table_code: 'reference.uom_reference', column_code: 'is_active', data_type: 'text', required_for_done: false, validation_json: { required: false } },
  { org_id: null, table_code: 'reference.currency_reference', column_code: 'code', data_type: 'text', required_for_done: true, validation_json: { required: true, pattern: '^[A-Z]{3}$' } },
  { org_id: null, table_code: 'reference.currency_reference', column_code: 'name', data_type: 'text', required_for_done: true, validation_json: { required: true } },
  { org_id: null, table_code: 'reference.currency_reference', column_code: 'is_active', data_type: 'text', required_for_done: false, validation_json: { required: false } },
  { org_id: null, table_code: 'reference.country_iso_reference', column_code: 'code', data_type: 'text', required_for_done: true, validation_json: { required: true, pattern: '^[A-Z]{2,3}$' } },
  { org_id: null, table_code: 'reference.country_iso_reference', column_code: 'name', data_type: 'text', required_for_done: true, validation_json: { required: true } },
  { org_id: null, table_code: 'reference.country_iso_reference', column_code: 'is_active', data_type: 'text', required_for_done: false, validation_json: { required: false } },
];

// EU-14 allergen families (Regulation (EU) No 1169/2011 Annex II).
const EU_14 = [
  ['GLUTEN', 'Cereals containing gluten'],
  ['CRUSTACEANS', 'Crustaceans'],
  ['EGGS', 'Eggs'],
  ['FISH', 'Fish'],
  ['PEANUTS', 'Peanuts'],
  ['SOYBEANS', 'Soybeans'],
  ['MILK', 'Milk'],
  ['NUTS', 'Tree nuts'],
  ['CELERY', 'Celery'],
  ['MUSTARD', 'Mustard'],
  ['SESAME', 'Sesame seeds'],
  ['SULPHITES', 'Sulphur dioxide and sulphites'],
  ['LUPIN', 'Lupin'],
  ['MOLLUSCS', 'Molluscs'],
] as const;

type ReferenceRow = {
  org_id: string;
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  display_order: number;
};

type QueryCall = { sql: string; params: readonly unknown[] };

const { _runWithOrgContext } = vi.hoisted(() => ({ _runWithOrgContext: vi.fn() }));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));
vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

function makeClient(opts: { orgId?: string; schema?: SchemaSeed[] } = {}) {
  const orgId = opts.orgId ?? ORG_ID;
  const schema = opts.schema ?? UNIVERSAL_TABLE_SCHEMAS;
  const rows = new Map<string, ReferenceRow>();
  const calls: QueryCall[] = [];
  const refreshes: Array<{ orgId: string; tableCode: string }> = [];

  const client = {
    calls,
    refreshes,
    rows,
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }

      if (norm.includes('from public.reference_schemas')) {
        const tableCodes = (params[0] as string[]) ?? [];
        const matched = schema.filter(
          (s) => tableCodes.includes(s.table_code) && (s.org_id === orgId || s.org_id === null),
        );
        const byColumn = new Map<string, SchemaSeed>();
        for (const s of [...matched].sort((a, b) => {
          if (a.column_code !== b.column_code) return a.column_code < b.column_code ? -1 : 1;
          if (a.org_id === b.org_id) return 0;
          return a.org_id === null ? 1 : -1;
        })) {
          if (!byColumn.has(s.column_code)) byColumn.set(s.column_code, s);
        }
        const resolved = [...byColumn.values()].map((s) => ({
          column_code: s.column_code,
          data_type: s.data_type,
          required_for_done: s.required_for_done,
          validation_json: s.validation_json,
        }));
        return { rows: resolved as never[], rowCount: resolved.length };
      }

      if (norm.includes('app.refresh_reference_table_mv')) {
        refreshes.push({ orgId: String(params[0]), tableCode: String(params[1]) });
        return { rows: [] as never[], rowCount: 1 };
      }
      if (norm.startsWith('insert into public.audit_log') || norm.startsWith('insert into public.outbox_events')) {
        return { rows: [{ id: 1 }] as never[], rowCount: 1 };
      }

      if (norm.startsWith('select') && norm.includes('from public.reference_tables')) {
        const tc = String(params[0]);
        const rk = String(params[1]);
        const row = rows.get(`${tc}:${rk}`);
        return { rows: (row ? [row] : []) as never[], rowCount: row ? 1 : 0 };
      }

      if (norm.startsWith('insert into public.reference_tables')) {
        const [pOrg, tc, rk, rowData, displayOrder] = params;
        const row: ReferenceRow = {
          org_id: String(pOrg),
          table_code: String(tc),
          row_key: String(rk),
          row_data: rowData as Record<string, unknown>,
          version: 1,
          is_active: true,
          display_order: Number(displayOrder ?? 0),
        };
        rows.set(`${row.table_code}:${row.row_key}`, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      return { rows: [] as never[], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: ReturnType<typeof makeClient>;

function useClient(client: ReturnType<typeof makeClient>) {
  currentClient = client;
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 't', client: currentClient }),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  useClient(makeClient());
});

async function loadUpsert() {
  const mod = (await import(`${__dirname}/upsert.ts`)) as Record<string, unknown>;
  return mod.upsertReferenceRow as (input: unknown) => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>;
}

describe('upsertReferenceRow — universal /settings/reference tables (W9-L5 FIX 1)', () => {
  it('fills the complete EU-14 allergen reference once migration-286 schemas resolve', async () => {
    const upsertReferenceRow = await loadUpsert();

    for (const [code, name] of EU_14) {
      const result = await upsertReferenceRow({
        tableCode: 'allergens_reference',
        rowKey: code,
        rowData: {
          allergen_code: code,
          display_name: name,
          eu_disclosure_text: `Contains ${name.toLowerCase()}`,
          risk_level: 'major',
          is_enabled: true,
        },
      });
      expect(result, `EU-14 allergen ${code} must save`).toMatchObject({ ok: true });
    }

    // All 14 rows persisted org-scoped.
    const saved = [...currentClient.rows.values()].filter((r) => r.table_code === 'allergens_reference');
    expect(saved).toHaveLength(14);
    expect(saved.every((r) => r.org_id === ORG_ID)).toBe(true);
  });

  it('saves uom / currency / country rows (boolean is_active accepted)', async () => {
    const upsertReferenceRow = await loadUpsert();

    const uom = await upsertReferenceRow({
      tableCode: 'uom_reference',
      rowKey: 'KG',
      rowData: { code: 'kg', name: 'Kilogram', is_active: true },
    });
    expect(uom).toMatchObject({ ok: true });

    const currency = await upsertReferenceRow({
      tableCode: 'currency_reference',
      rowKey: 'PLN',
      rowData: { code: 'PLN', name: 'Polish złoty', is_active: true },
    });
    expect(currency).toMatchObject({ ok: true });

    const country = await upsertReferenceRow({
      tableCode: 'country_iso_reference',
      rowKey: 'PL',
      rowData: { code: 'PL', name: 'Poland', is_active: true },
    });
    expect(country).toMatchObject({ ok: true });
  });

  it('surfaces the FAILING FIELD instead of a bare invalid_input', async () => {
    const upsertReferenceRow = await loadUpsert();

    // required column missing → names the column
    const missingName = await upsertReferenceRow({
      tableCode: 'allergens_reference',
      rowKey: 'MUSTARD',
      rowData: { allergen_code: 'MUSTARD', risk_level: 'major', is_enabled: true },
    });
    expect(missingName).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(missingName.message).toBe('display_name is required');

    // out-of-enum value → names the column + type
    const badEnum = await upsertReferenceRow({
      tableCode: 'allergens_reference',
      rowKey: 'MUSTARD',
      rowData: { allergen_code: 'MUSTARD', display_name: 'Mustard', risk_level: 'catastrophic' },
    });
    expect(badEnum).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(badEnum.message).toBe('risk_level has invalid enum value');

    // top-level parse failure → names the input field
    const missingRowKey = await upsertReferenceRow({
      tableCode: 'allergens_reference',
      rowData: { allergen_code: 'MUSTARD', display_name: 'Mustard' },
    });
    expect(missingRowKey).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(missingRowKey.message).toContain('rowKey');
  });

  it('names the table when its reference schema is not seeded (pre-migration-286 state)', async () => {
    useClient(makeClient({ schema: [] }));
    const upsertReferenceRow = await loadUpsert();

    const result = await upsertReferenceRow({
      tableCode: 'allergens_reference',
      rowKey: 'MILK',
      rowData: { allergen_code: 'MILK', display_name: 'Milk' },
    });
    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(result.message).toContain('reference schema is not configured for allergens_reference');
  });
});
