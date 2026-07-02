import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '44444444-4444-4444-8444-444444444444';
const SHIFT_PATTERN_ID = '55555555-5555-4555-8555-555555555555';
const DEVICE_ID = '66666666-6666-4666-8666-666666666666';
const IMPORT_JOB_ID = '77777777-7777-4777-8777-777777777777';
const EXPORT_JOB_ID = '99999999-9999-4999-8999-999999999999';
const LABEL_TEMPLATE_ID = '88888888-8888-4888-8888-888888888888';
const LINE_ID = '99999999-9999-4999-8999-999999999999';
const OVERRIDE_TYPE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REASON_CODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RMA_REASON_CODE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PRODUCT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BOM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MACHINE_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';

let duplicateLineCodeAtSelectedSite = false;

type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  calls: QueryCall[];
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

const { runWithOrgContext, revalidatePathMock } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: revalidatePathMock,
}));

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as never[], rowCount: 1 };

      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.items i') && normalized.includes("i.item_type in ('fg', 'intermediate', 'co_product', 'byproduct')")) {
        if (params[0] !== ORG_ID) return { rows: [] as never[], rowCount: 0 };
        return {
          rows: [
            {
              id: PRODUCT_ID,
              sku: 'FG-YOG-001',
              name: 'Greek yoghurt 150g',
              category: 'Dairy',
              unit: 'kg',
              weight: '0.15',
              bom_link: 'BOM-EEEEEEEE',
              line: 'LINE-1',
              status: 'active',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.bom_headers h') && normalized.includes('left join public.bom_lines bl')) {
        if (params[0] !== ORG_ID) return { rows: [] as never[], rowCount: 0 };
        return {
          rows: [
            {
              id: BOM_ID,
              bom_number: 'BOM-EEEEEEEE',
              product: 'Greek yoghurt 150g',
              version: 3,
              ingredients_count: 5,
              last_updated: '2026-06-06',
              status: 'active',
            },
            {
              id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              bom_number: 'BOM-FFFFFFFF',
              product: 'Pilot kefir 250g',
              version: 1,
              ingredients_count: 4,
              last_updated: '2026-06-05',
              status: 'draft',
            },
          ] as never[],
          rowCount: 2,
        };
      }

      if (normalized.includes('from public.bom_settings')) {
        if (params[0] !== ORG_ID) return { rows: [] as never[], rowCount: 0 };
        return {
          rows: [
            {
              auto_calculate_nutrition: true,
              require_allergen_review: true,
              retention: '10',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.shift_patterns sp') && normalized.includes('join public.shift_configs sc')) {
        return {
          rows: [
            {
              id: SHIFT_PATTERN_ID,
              name: 'Morning',
              start_time: '06:00:00',
              end_time: '14:00:00',
              days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
              site_id: SITE_ID,
              site_name: 'Apex Warsaw',
              line_id: 'LINE-1',
              line_label: 'LINE-1 - Yoghurt line',
              org_id: ORG_ID,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.sites') && !normalized.includes('from public.sites s')) {
        if (normalized.includes('select true as ok')) return { rows: [{ ok: true }] as never[], rowCount: 1 };
        return {
          rows: [{ id: SITE_ID, code: 'S1', site_code: 'S1', name: 'Apex Warsaw', is_default: true }] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.production_lines') && !normalized.includes('from public.production_lines pl')) {
        return {
          rows: [{ id: LINE_ID, code: 'LINE-1', name: 'Yoghurt line', site_id: SITE_ID }] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.org_non_production_days')) {
        return {
          rows: [{ date: '2026-06-03', reason: 'holiday', notes: 'Corpus Christi', site_id: SITE_ID }] as never[],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('select shift_id from public.shift_patterns')) {
        return { rows: [{ shift_id: 'shift-existing' }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.shift_configs') || normalized.startsWith('update public.shift_configs')) {
        return { rows: [] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.shift_patterns') || normalized.startsWith('update public.shift_patterns')) {
        return {
          rows: [
            {
              id: SHIFT_PATTERN_ID,
              name: 'Morning',
              start_time: '06:00:00',
              end_time: '14:00:00',
              days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
              site_id: SITE_ID,
              site_name: null,
              line_id: 'LINE-1',
              line_label: null,
              org_id: ORG_ID,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      // SELECT list query (queryDevices) joins sites + production_lines to resolve
      // human site_name / line_name (Rule 0.11: no raw UUID in the UI).
      if (normalized.includes('from public.scanner_devices d')) {
        return {
          rows: [
            {
              id: DEVICE_ID,
              name: 'Handheld 01',
              model: 'Zebra TC22',
              site_id: SITE_ID,
              site_name: 'Apex Warsaw',
              line_id: 'LINE-1',
              line_name: 'Yoghurt line',
              battery_level: 87,
              last_seen_at: '2026-06-06T09:00:00.000Z',
              status: 'online',
              org_id: ORG_ID,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      // pairDevice wraps the INSERT in a CTE then re-selects with the same joins
      // (`with inserted as (insert into public.scanner_devices …) select … from inserted d`).
      if (
        normalized.includes('into public.scanner_devices') &&
        normalized.includes('from inserted d')
      ) {
        return {
          rows: [
            {
              id: DEVICE_ID,
              name: String(params[1]),
              model: String(params[2]),
              site_id: params[3] as string | null,
              site_name: params[3] ? 'Apex Warsaw' : null,
              line_id: params[4] as string | null,
              line_name: params[4] ? 'Yoghurt line' : null,
              battery_level: 100,
              last_seen_at: '2026-06-06T10:00:00.000Z',
              status: 'online',
              org_id: ORG_ID,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.scanner_device_defaults')) {
        return {
          rows: [{ auto_lock_minutes: 10, login_per_shift: true, offline_mode: false, org_id: ORG_ID }] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('as finished_goods_count')) {
        return {
          rows: [
            {
              finished_goods_count: 12,
              components_count: 42,
              boms_count: 7,
              suppliers_count: 5,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.import_export_jobs') && normalized.includes('group by target')) {
        return {
          rows: [
            { target: 'finished_goods', last_imported_at: '2026-06-05T12:00:00.000Z' },
            { target: 'boms', last_imported_at: '2026-06-04T08:00:00.000Z' },
          ] as never[],
          rowCount: 2,
        };
      }

      if (normalized.includes('from public.import_export_jobs') && normalized.includes("and kind = 'import'")) {
        return {
          rows: [
            {
              id: IMPORT_JOB_ID,
              target: 'finished_goods',
              status: 'completed',
              progress_processed: 12,
              progress_total: 12,
              source_file_name: 'finished-goods.csv',
              metadata: {},
              created_at: '2026-06-05T12:00:00.000Z',
              completed_at: '2026-06-05T12:01:00.000Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      // Export ledger (kind='export'): cross-module exports such as the Purchase
      // Orders "Export to file" action (target='purchase_orders') must surface here.
      if (normalized.includes('from public.import_export_jobs') && normalized.includes("and kind = 'export'")) {
        return {
          rows: [
            {
              id: EXPORT_JOB_ID,
              target: 'purchase_orders',
              status: 'completed',
              progress_processed: 17,
              download_url: '/api/settings/import-export/jobs/' + EXPORT_JOB_ID,
              created_at: '2026-06-06T09:00:00.000Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.label_templates') && !normalized.startsWith('insert into public.label_templates')) {
        return {
          rows: [
            {
              id: LABEL_TEMPLATE_ID,
              org_id: ORG_ID,
              name: 'Case label',
              size: '100x150mm',
              used_on: 'Finished goods',
              elements: [{ type: 'text', value: 'LOT' }],
              status: 'active',
              created_at: '2026-06-01T10:00:00.000Z',
              updated_at: '2026-06-06T10:00:00.000Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.scanner_device_defaults')) {
        return {
          rows: [{ auto_lock_minutes: params[1], login_per_shift: params[2], offline_mode: params[3], org_id: ORG_ID }] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.sites s')) {
        return {
          rows: [
            {
              id: SITE_ID,
              org_id: ORG_ID,
              site_code: 'S1',
              name: 'Apex Warsaw',
              is_default: true,
              country: 'PL',
              address_text: 'Factory 1, Warsaw, 00-001, Poland',
              latitude: '52.2297',
              longitude: '21.0122',
              map_x: '52',
              map_y: '41',
              operating_hours: 'Mon-Fri 06:00-22:00',
              haccp_enabled: true,
              haccp_valid_until: '2026-09-14',
              line_count: '1',
              worker_count: '1',
              is_active: true,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.production_lines pl') && normalized.includes('left join public.shift_patterns sp')) {
        return {
          rows: [
            {
              id: LINE_ID,
              org_id: ORG_ID,
              code: 'LINE-1',
              name: 'Yoghurt line',
              type: 'production',
              workers: '1',
              status: 'active',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      // createLine now delegates to the canonical infra upsertLine, whose INSERT is
      // (id, org_id, site_id, warehouse_id, default_output_location_id, code, name, status)
      // with binds [id, siteId, warehouseId, defaultOutputLocationId, code, name, status, machineIds[]].
      // A duplicate (site_id, code) is rejected by the DB unique index (SQLSTATE 23505),
      // not by an application-level pre-check — simulate that with a thrown pg error.
      if (normalized.startsWith('insert into public.production_lines')) {
        if (duplicateLineCodeAtSelectedSite) {
          const dupError = new Error('duplicate key value violates unique constraint') as Error & { code?: string };
          dupError.code = '23505';
          throw dupError;
        }
        return {
          rows: [
            {
              id: LINE_ID,
              code: String(params[4] ?? 'LINE-1'),
              name: String(params[5] ?? 'Yoghurt line'),
              status: String(params[6] ?? 'active'),
              default_output_location_id: (params[3] as string | null) ?? null,
              machine_ids: (params[7] as string[] | undefined) ?? [],
            },
          ] as never[],
          rowCount: 1,
        };
      }

      // upsertLine validates machine references, then rewrites line_machines rows.
      if (normalized.startsWith('select id, status') && normalized.includes('from public.machines')) {
        const ids = (params[0] as string[] | undefined) ?? [];
        return { rows: ids.map((id) => ({ id, status: 'active' })) as never[], rowCount: ids.length };
      }
      if (normalized.startsWith('delete from public.line_machines')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.line_machines')) {
        return { rows: [] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.sites') && normalized.includes('returning id::text')) {
        return {
          rows: [
            {
              id: SITE_ID,
              org_id: ORG_ID,
              site_code: 'S1',
              name: 'Apex Warsaw',
              is_default: true,
              country: 'PL',
              address_text: 'Factory 1, Warsaw, 00-001, Poland',
              latitude: '52.2297',
              longitude: '21.0122',
              map_x: '52',
              map_y: '41',
              operating_hours: params[3],
              haccp_enabled: params[4],
              haccp_valid_until: params[5],
              line_count: '0',
              worker_count: '0',
              is_active: true,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('update public.sites')) {
        return { rows: [] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.shipping_override_reasons')) {
        return {
          rows: [
            {
              id: REASON_CODE_ID,
              org_id: ORG_ID,
              override_type_id: params[1],
              override_type_code: 'fefo_deviation',
              code: params[2],
              label: params[3],
              requires_note: params[4],
              display_order: params[5],
              is_active: params[6],
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('update public.shipping_override_reasons r')) {
        return {
          rows: [
            {
              id: params[0],
              org_id: ORG_ID,
              override_type_id: params[2] ?? OVERRIDE_TYPE_ID,
              override_type_code: 'fefo_deviation',
              code: params[3],
              label: params[4],
              requires_note: params[5],
              display_order: params[6],
              is_active: params[7],
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('update public.shipping_override_reasons')) {
        return { rows: [{ id: params[0] }] as never[], rowCount: 1 };
      }

      if (normalized.includes('from public.shipping_override_types ot')) {
        return {
          rows: [
            {
              id: OVERRIDE_TYPE_ID,
              org_id: ORG_ID,
              code: 'fefo_deviation',
              label: 'FEFO deviation',
              description: 'Deviation from FEFO allocation',
              display_order: '10',
              is_active: true,
              reason_count: '1',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.shipping_override_reasons r')) {
        return {
          rows: [
            {
              id: REASON_CODE_ID,
              org_id: ORG_ID,
              override_type_id: OVERRIDE_TYPE_ID,
              override_type_code: 'fefo_deviation',
              code: 'CUSTOMER_APPROVED',
              label: 'Customer approved',
              requires_note: true,
              display_order: '10',
              is_active: true,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.rma_reason_codes')) {
        return {
          rows: [
            {
              id: RMA_REASON_CODE_ID,
              org_id: ORG_ID,
              code: 'DAMAGED',
              label_en: 'Damaged in transit',
              label_pl: 'Uszkodzone w transporcie',
              display_order: '10',
              is_active: true,
            },
          ] as never[],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.label_templates') || normalized.startsWith('update public.label_templates')) {
        return {
          rows: [
            {
              id: LABEL_TEMPLATE_ID,
              org_id: ORG_ID,
              name: normalized.includes('select org_id') ? 'Case label Copy' : String(params[1] ?? 'Case label'),
              size: normalized.includes('select org_id') ? '100x150mm' : String(params[2] ?? '100x150mm'),
              used_on: normalized.includes('select org_id') ? 'Finished goods' : String(params[3] ?? 'Finished goods'),
              elements: [{ type: 'text', value: 'LOT' }],
              status: normalized.includes('select org_id') ? 'draft' : String(params[5] ?? 'active'),
              created_at: '2026-06-01T10:00:00.000Z',
              updated_at: '2026-06-06T10:00:00.000Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }

      throw new Error(`Unhandled SQL: ${normalized}`);
    },
  };
  return client;
}

async function withFakeOrg<T>(client: FakeClient, action: () => Promise<T>): Promise<T> {
  runWithOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
    callback({ userId: USER_ID, orgId: ORG_ID, client }),
  );
  return action();
}

describe('settings shifts/devices wiring contract', () => {
  beforeEach(() => {
    vi.resetModules();
    duplicateLineCodeAtSelectedSite = false;
    runWithOrgContext.mockReset();
    revalidatePathMock.mockReset();
  });

  it('wires Shifts & Calendar consumers to canonical org-scoped planning/OEE tables', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/shifts/_actions/shifts');

    const [patterns, calendar] = await withFakeOrg(client, () =>
      Promise.all([mod.getShiftPatterns(ORG_ID), mod.getCalendarData(ORG_ID, 2026, 6)]),
    );

    expect(patterns).toEqual([
      {
        id: SHIFT_PATTERN_ID,
        name: 'Morning',
        start_time: '06:00:00',
        end_time: '14:00:00',
        days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
        site_id: SITE_ID,
        site_name: 'Apex Warsaw',
        line_id: 'LINE-1',
        line_label: 'LINE-1 - Yoghurt line',
        org_id: ORG_ID,
      },
    ]);
    expect(calendar).toHaveLength(30);
    expect(calendar.find((day) => day.date === '2026-06-03')).toMatchObject({
      kind: 'holiday',
      reason: 'holiday',
      org_id: ORG_ID,
    });
    expect(calendar.find((day) => day.date === '2026-06-06')).toMatchObject({ kind: 'weekend' });
    expect(client.calls.map((call) => call.sql).join('\n')).toContain('public.shift_patterns');
    expect(client.calls.map((call) => call.sql).join('\n')).toContain('public.shift_configs');
    expect(client.calls.map((call) => call.sql).join('\n')).toContain('public.org_non_production_days');
    expect(client.calls.some((call) => call.params.includes(ORG_ID))).toBe(true);

    const crossOrg = await withFakeOrg(client, () => mod.getShiftPatterns(OTHER_ORG_ID));
    expect(crossOrg).toEqual([]);
  });

  it('wires Shifts & Calendar loader producer to the page consumer shape', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/shifts/_actions/shifts');
    const pageSource = readFileSync(
      resolve(__dirname, '../app/[locale]/(app)/(admin)/settings/shifts/page.tsx'),
      'utf8',
    );

    const data = await withFakeOrg(client, () => mod.readShiftsSettingsData(2026, 6));

    expect(pageSource).toContain('readShiftsSettingsData(year, month)');
    expect(pageSource).toContain('shiftPatterns={data.shift_patterns}');
    expect(pageSource).toContain('calendarDays={data.calendar_days}');
    expect(data).toEqual({
      org_id: ORG_ID,
      shift_patterns: [
        expect.objectContaining({
          id: SHIFT_PATTERN_ID,
          name: 'Morning',
          start_time: '06:00:00',
          end_time: '14:00:00',
          days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
          site_id: SITE_ID,
          site_name: 'Apex Warsaw',
          line_id: 'LINE-1',
          line_label: 'LINE-1 - Yoghurt line',
          org_id: ORG_ID,
        }),
      ],
      calendar_days: expect.arrayContaining([
        expect.objectContaining({
          date: '2026-06-03',
          day: 3,
          kind: 'holiday',
          reason: 'holiday',
          notes: 'Corpus Christi',
          site_id: SITE_ID,
          org_id: ORG_ID,
        }),
        expect.objectContaining({
          date: '2026-06-06',
          day: 6,
          kind: 'weekend',
          org_id: ORG_ID,
        }),
      ]),
      sites: [expect.objectContaining({ id: SITE_ID, code: 'S1', name: 'Apex Warsaw' })],
      lines: [expect.objectContaining({ id: LINE_ID, code: 'LINE-1', name: 'Yoghurt line', site_id: SITE_ID })],
      can_edit: true,
    });
    expect(data.calendar_days).toHaveLength(30);
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.shift_patterns sp');
    expect(sql).toContain('join public.shift_configs sc');
    expect(sql).toContain('from public.org_non_production_days');
    expect(sql).toContain('from public.sites');
    expect(sql).toContain('from public.production_lines');
    expect(client.calls.some((call) => call.params.includes(ORG_ID))).toBe(true);
  });

  it('wires Shifts & Calendar producers through permissioned org-context writes', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/shifts/_actions/shifts');

    const created = await withFakeOrg(client, () =>
      mod.createShiftPattern({
        name: 'Morning',
        start_time: '06:00',
        end_time: '14:00',
        days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
        site_id: SITE_ID,
        line_id: 'LINE-1',
      }),
    );
    const updated = await withFakeOrg(client, () =>
      mod.updateShiftPattern({
        id: SHIFT_PATTERN_ID,
        name: 'Morning',
        start_time: '06:00',
        end_time: '14:00',
        days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
        site_id: SITE_ID,
        line_id: 'LINE-1',
      }),
    );

    expect(created).toMatchObject({ ok: true, data: { id: SHIFT_PATTERN_ID, org_id: ORG_ID } });
    expect(updated).toMatchObject({ ok: true, data: { id: SHIFT_PATTERN_ID, org_id: ORG_ID } });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.user_roles');
    expect(sql).toContain('insert into public.shift_configs');
    expect(sql).toContain('insert into public.shift_patterns');
    expect(sql).toContain('update public.shift_configs');
    expect(sql).toContain('update public.shift_patterns');
    expect(client.calls.some((call) => call.params.includes(USER_ID))).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/shifts');
  });

  it('wires Scanner Devices consumers/producers to org-scoped scanner device tables', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/devices/_actions/devices');

    const [devices, defaults] = await withFakeOrg(client, () =>
      Promise.all([mod.getDevices(ORG_ID), mod.getDeviceDefaults(ORG_ID)]),
    );
    const paired = await withFakeOrg(client, () =>
      mod.pairDevice({ name: 'Handheld 02', model: 'Zebra TC22', site_id: SITE_ID, line_id: 'LINE-1' }),
    );
    const savedDefaults = await withFakeOrg(client, () =>
      mod.updateDeviceDefaults({ auto_lock_minutes: 15, login_per_shift: false, offline_mode: true }),
    );

    expect(devices[0]).toMatchObject({ id: DEVICE_ID, status: 'online', org_id: ORG_ID });
    expect(defaults).toEqual({ auto_lock_minutes: 10, login_per_shift: true, offline_mode: false, org_id: ORG_ID });
    expect(paired).toMatchObject({ ok: true, data: { name: 'Handheld 02', model: 'Zebra TC22', org_id: ORG_ID } });
    expect(savedDefaults).toEqual({
      ok: true,
      data: { auto_lock_minutes: 15, login_per_shift: false, offline_mode: true, org_id: ORG_ID },
    });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.scanner_devices');
    expect(sql).toContain('from public.scanner_device_defaults');
    expect(sql).toContain('insert into public.scanner_devices');
    expect(sql).toContain('insert into public.scanner_device_defaults');
    expect(client.calls.some((call) => call.params.includes(ORG_ID))).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/devices');
  });

  it('wires Scanner Devices loader producer to the page consumer shape', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/devices/_actions/devices');
    const pageSource = readFileSync(
      resolve(__dirname, '../app/[locale]/(app)/(admin)/settings/devices/page.tsx'),
      'utf8',
    );

    const data = await withFakeOrg(client, () => mod.readDevicesSettingsData());

    expect(pageSource).toContain('readDevicesSettingsData()');
    expect(pageSource).toContain('devices={result.devices}');
    expect(pageSource).toContain('defaults={result.defaults}');
    expect(data).toEqual({
      org_id: ORG_ID,
      devices: [
        {
          id: DEVICE_ID,
          name: 'Handheld 01',
          model: 'Zebra TC22',
          site_id: SITE_ID,
          site_name: 'Apex Warsaw',
          line_id: 'LINE-1',
          line_name: 'Yoghurt line',
          battery_level: 87,
          last_seen_at: '2026-06-06T09:00:00.000Z',
          status: 'online',
          org_id: ORG_ID,
        },
      ],
      defaults: {
        auto_lock_minutes: 10,
        login_per_shift: true,
        offline_mode: false,
        org_id: ORG_ID,
      },
      // Stale test contract: devices settings now preloads site and line option lists for assignment controls.
      sites: [
        {
          id: SITE_ID,
          code: 'S1',
          site_code: 'S1',
          name: 'Apex Warsaw',
          is_default: true,
        },
      ],
      lines: [
        {
          id: LINE_ID,
          site_id: SITE_ID,
          code: 'LINE-1',
          name: 'Yoghurt line',
        },
      ],
    });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.scanner_devices');
    expect(sql).toContain('from public.scanner_device_defaults');
    expect(client.calls.some((call) => call.params.includes(ORG_ID))).toBe(true);
  });

  it('keeps the server pages as consumers of the real loaders and keeps RLS policies in the local migration', () => {
    const root = resolve(__dirname, '../../../');
    const shiftsPage = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/shifts/page.tsx'),
      'utf8',
    );
    const devicesPage = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/devices/page.tsx'),
      'utf8',
    );
    const shiftsActions = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/shifts/_actions/shifts.ts'),
      'utf8',
    );
    const devicesActions = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/devices/_actions/devices.ts'),
      'utf8',
    );
    // Stale test contract: migrations use numbered filenames in this repo.
    const migration = readFileSync(resolve(root, 'packages/db/migrations/238-settings-scanner-devices.sql'), 'utf8');

    expect(shiftsPage).toContain('readShiftsSettingsData');
    expect(shiftsActions).toContain('getShiftPatterns');
    expect(shiftsActions).toContain('getCalendarData');
    expect(devicesPage).toContain('readDevicesSettingsData');
    expect(devicesActions).toContain('getDevices');
    expect(devicesActions).toContain('getDeviceDefaults');
    expect(migration).toContain('org_id');
    expect(migration).toContain('app.current_org_id()');
    expect(migration).toContain("status in ('online', 'offline', 'low_battery')");
    expect(migration).not.toContain('tenant_id');
  });

  it('wires Sites & Production Lines consumers/producers to canonical sites and production_lines tables', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/sites/_actions/sites');

    const [sites, lines] = await withFakeOrg(client, () =>
      Promise.all([mod.getSites(ORG_ID), mod.getLinesForSite(ORG_ID, SITE_ID)]),
    );
    const saved = await withFakeOrg(client, () =>
      mod.updateSiteSettings(ORG_ID, SITE_ID, {
        primary: true,
        operating_hours: 'Mon-Fri 06:00-22:00',
        haccp_enabled: true,
        haccp_valid_until: '2026-09-14',
      }),
    );
    // An ACTIVE line requires at least one machine (canonical infra upsertLine rule:
    // status='active' with zero machines => line_requires_machine). The contract test
    // supplies a machine so the active-line happy path is exercised.
    const createdLine = await withFakeOrg(client, () =>
      mod.createLine({
        site_id: SITE_ID,
        code: 'LINE-1',
        name: 'Yoghurt line',
        status: 'active',
        machineIds: [MACHINE_ID],
      }),
    );
    const sameCodeDifferentSite = await withFakeOrg(client, () =>
      mod.createLine({
        site_id: DEVICE_ID,
        code: 'LINE-1',
        name: 'Yoghurt line at another site',
        status: 'active',
        machineIds: [MACHINE_ID],
      }),
    );
    duplicateLineCodeAtSelectedSite = true;
    const duplicateLine = await withFakeOrg(client, () =>
      mod.createLine({
        site_id: SITE_ID,
        code: 'LINE-1',
        name: 'Duplicate yoghurt line',
        status: 'active',
        machineIds: [MACHINE_ID],
      }),
    );

    expect(sites).toEqual([
      expect.objectContaining({
        id: SITE_ID,
        org_id: ORG_ID,
        code: 'S1',
        address: 'Factory 1, Warsaw, 00-001, Poland',
        settings: expect.objectContaining({ primary: true, haccp_enabled: true }),
      }),
    ]);
    expect(lines).toEqual([
      expect.objectContaining({ id: LINE_ID, org_id: ORG_ID, code: 'LINE-1', status: 'active' }),
    ]);
    expect(saved).toMatchObject({ ok: true, data: { id: SITE_ID, org_id: ORG_ID } });
    expect(createdLine).toMatchObject({ ok: true, data: { id: LINE_ID, code: 'LINE-1' } });
    expect(sameCodeDifferentSite).toMatchObject({ ok: true, data: { id: LINE_ID, code: 'LINE-1' } });
    // A duplicate (site_id, code) is rejected by the DB unique index; the canonical
    // infra upsertLine maps the failure to persistence_failed.
    expect(duplicateLine).toEqual({ ok: false, error: 'persistence_failed' });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.sites s');
    expect(sql).toContain('from public.production_lines pl');
    expect(sql).toContain('left join public.shift_patterns sp');
    expect(sql).toContain('and pl.site_id = $2::uuid');
    expect(sql).toContain('insert into public.production_lines (id, org_id, site_id, warehouse_id, default_output_location_id, code, name, status)');
    expect(sql).toContain('update public.sites');
    expect(sql).toContain('app.current_org_id()');
    expect(client.calls.some((call) => call.params.includes(ORG_ID))).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/sites');

    const crossOrgSites = await withFakeOrg(client, () => mod.getSites(OTHER_ORG_ID));
    expect(crossOrgSites).toEqual([]);
  });

  it('wires Products loader producer to the page consumer shape', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/products/_actions/products');
    const pageSource = readFileSync(
      resolve(__dirname, '../app/[locale]/(app)/(admin)/settings/products/page.tsx'),
      'utf8',
    );

    const products = await withFakeOrg(client, () => mod.getProducts());

    expect(pageSource).toContain('getProducts()');
    expect(pageSource).toContain('products={products}');
    expect(products).toEqual([
      {
        id: PRODUCT_ID,
        sku: 'FG-YOG-001',
        name: 'Greek yoghurt 150g',
        category: 'Dairy',
        unit: 'kg',
        weight: '0.15',
        bomLink: 'BOM-EEEEEEEE',
        status: 'active',
      },
    ]);
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.items i');
    expect(sql).toContain('left join lateral');
    expect(sql).toContain('from public.bom_headers h');
    expect(sql).toContain('app.current_org_id()');
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);

    const crossOrg = await withFakeOrg(client, () => mod.getProducts(OTHER_ORG_ID));
    expect(crossOrg).toEqual([]);
  });

  it('wires BOMs loader producers to the page consumer shape', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/boms/_actions/boms');
    const pageSource = readFileSync(
      resolve(__dirname, '../app/[locale]/(app)/(admin)/settings/boms/page.tsx'),
      'utf8',
    );

    const [boms, settings] = await withFakeOrg(client, () => Promise.all([mod.getBoms(), mod.getBomSettings()]));

    expect(pageSource).toContain('getBoms()');
    expect(pageSource).toContain('getBomSettings()');
    expect(pageSource).toContain('rows={boms.rows}');
    expect(pageSource).toContain('kpis={boms.kpis}');
    expect(pageSource).toContain('settings={settings}');
    expect(boms).toEqual({
      kpis: { active: 1, draft: 1, archived: 0 },
      rows: [
        {
          id: BOM_ID,
          bomNumber: 'BOM-EEEEEEEE',
          product: 'Greek yoghurt 150g',
          version: 'v3',
          ingredientsCount: 5,
          lastUpdated: '2026-06-06',
          status: 'active',
        },
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          bomNumber: 'BOM-FFFFFFFF',
          product: 'Pilot kefir 250g',
          version: 'v1',
          ingredientsCount: 4,
          lastUpdated: '2026-06-05',
          status: 'draft',
        },
      ],
    });
    expect(settings).toEqual({
      autoCalculateNutrition: true,
      requireAllergenReview: true,
      retention: '10',
    });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.bom_headers h');
    expect(sql).toContain('left join public.bom_lines bl');
    expect(sql).toContain('from public.bom_settings');
    expect(sql).toContain('app.current_org_id()');
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);

    const crossOrg = await withFakeOrg(client, () => mod.getBoms(OTHER_ORG_ID));
    expect(crossOrg).toEqual({ kpis: { active: 0, draft: 0, archived: 0 }, rows: [] });
  });

  it('wires Shipping Override Reasons consumers/producers to org-scoped shipping reason tables', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/ship-override-reasons/_actions/shipping-overrides');

    const [types, reasons, rmaReasons] = await withFakeOrg(client, () =>
      Promise.all([mod.getOverrideTypes(ORG_ID), mod.getReasonCodes(ORG_ID, OVERRIDE_TYPE_ID), mod.getRmaReasonCodes(ORG_ID)]),
    );
    const created = await withFakeOrg(client, () =>
      mod.createReasonCode({
        orgId: ORG_ID,
        overrideTypeId: OVERRIDE_TYPE_ID,
        code: 'CUSTOMER_APPROVED',
        label: 'Customer approved',
        requires_note: true,
        display_order: 10,
        is_active: true,
      }),
    );
    const updated = await withFakeOrg(client, () =>
      mod.updateReasonCode({
        orgId: ORG_ID,
        id: REASON_CODE_ID,
        overrideTypeId: OVERRIDE_TYPE_ID,
        code: 'QA_APPROVED',
        label: 'QA approved',
        requires_note: true,
        display_order: 20,
        is_active: true,
      }),
    );
    const deleted = await withFakeOrg(client, () => mod.deleteReasonCode({ orgId: ORG_ID, id: REASON_CODE_ID }));

    expect(types[0]).toMatchObject({ id: OVERRIDE_TYPE_ID, org_id: ORG_ID, code: 'fefo_deviation', reason_count: 1 });
    expect(reasons[0]).toMatchObject({ id: REASON_CODE_ID, org_id: ORG_ID, override_type_id: OVERRIDE_TYPE_ID });
    expect(rmaReasons[0]).toMatchObject({ id: RMA_REASON_CODE_ID, org_id: ORG_ID, code: 'DAMAGED' });
    expect(created).toMatchObject({ ok: true, data: { org_id: ORG_ID, code: 'CUSTOMER_APPROVED' } });
    expect(updated).toMatchObject({ ok: true, data: { org_id: ORG_ID, code: 'QA_APPROVED' } });
    expect(deleted).toEqual({ ok: true, deleted: true, id: REASON_CODE_ID });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.shipping_override_types ot');
    expect(sql).toContain('from public.shipping_override_reasons r');
    expect(sql).toContain('from public.rma_reason_codes');
    expect(sql).toContain('insert into public.shipping_override_reasons');
    expect(sql).toContain('update public.shipping_override_reasons r');
    expect(sql).toContain('app.current_org_id()');
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/ship-override-reasons');
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/shipping-overrides');

    const crossOrgTypes = await withFakeOrg(client, () => mod.getOverrideTypes(OTHER_ORG_ID));
    expect(crossOrgTypes).toEqual([]);
  });

  it('wires Shipping Override Reasons loader producer to the page consumer shape', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/ship-override-reasons/_actions/shipping-overrides');
    const pageSource = readFileSync(
      resolve(__dirname, '../app/[locale]/(app)/(admin)/settings/ship-override-reasons/page.tsx'),
      'utf8',
    );

    const data = await withFakeOrg(client, () => mod.readShippingOverridesSettingsData());

    expect(pageSource).toContain('readShippingOverridesSettingsData()');
    expect(pageSource).toContain('overrideTypes={data.override_types}');
    expect(pageSource).toContain('selectedOverrideTypeId={data.selected_override_type_id}');
    expect(pageSource).toContain('reasonCodes={data.reason_codes}');
    expect(pageSource).toContain('rmaReasonCodes={data.rma_reason_codes}');
    expect(data).toEqual({
      org_id: ORG_ID,
      override_types: [
        {
          id: OVERRIDE_TYPE_ID,
          org_id: ORG_ID,
          code: 'fefo_deviation',
          label: 'FEFO deviation',
          description: 'Deviation from FEFO allocation',
          display_order: 10,
          is_active: true,
          reason_count: 1,
        },
      ],
      selected_override_type_id: OVERRIDE_TYPE_ID,
      reason_codes: [
        {
          id: REASON_CODE_ID,
          org_id: ORG_ID,
          override_type_id: OVERRIDE_TYPE_ID,
          override_type_code: 'fefo_deviation',
          code: 'CUSTOMER_APPROVED',
          label: 'Customer approved',
          requires_note: true,
          display_order: 10,
          is_active: true,
        },
      ],
      rma_reason_codes: [
        {
          id: RMA_REASON_CODE_ID,
          org_id: ORG_ID,
          code: 'DAMAGED',
          label_en: 'Damaged in transit',
          label_pl: 'Uszkodzone w transporcie',
          display_order: 10,
          is_active: true,
        },
      ],
    });
    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.shipping_override_types ot');
    expect(sql).toContain('from public.shipping_override_reasons r');
    expect(sql).toContain('from public.rma_reason_codes');
    expect(sql).toContain('app.current_org_id()');
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);
  });

  it('keeps Sites and Shipping server pages wired to loaders and flags the local shipping migration RLS contract', () => {
    const root = resolve(__dirname, '../../../');
    const sitesPage = readFileSync(resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/sites/page.tsx'), 'utf8');
    const sitesActions = readFileSync(resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts'), 'utf8');
    const shipPage = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/ship-override-reasons/page.tsx'),
      'utf8',
    );
    const shippingAliasPage = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/shipping-overrides/page.tsx'),
      'utf8',
    );
    const shipActions = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/ship-override-reasons/_actions/shipping-overrides.ts'),
      'utf8',
    );
    // Stale test contract: migrations use numbered filenames in this repo.
    const migration = readFileSync(resolve(root, 'packages/db/migrations/240-settings-shipping-override-reasons.sql'), 'utf8');

    expect(sitesPage).toContain('readSitesSettingsData');
    expect(sitesActions).toContain('getSites');
    expect(sitesActions).toContain('getLinesForSite');
    expect(sitesActions).toContain('updateSiteSettings');
    expect(shipPage).toContain('readShippingOverridesSettingsData');
    // Stale test contract: shipping-overrides is now a redirect alias to the canonical ship-override-reasons page.
    expect(shippingAliasPage).toContain("redirect(`/${locale}/settings/ship-override-reasons`)");
    expect(shipActions).toContain('getOverrideTypes');
    expect(shipActions).toContain('getReasonCodes');
    expect(shipActions).toContain('getRmaReasonCodes');
    expect(shipActions).toContain('createReasonCode');
    expect(shipActions).toContain('updateReasonCode');
    expect(shipActions).toContain('deleteReasonCode');
    expect(migration).toContain('shipping_override_reasons');
    expect(migration).toContain('rma_reason_codes');
    expect(migration).toContain('org_id');
    expect(migration).toContain('app.current_org_id()');
    expect(migration).not.toContain('tenant_id');
  });

  it('wires the new Import / Export master-data loader to canonical org-scoped tables and jobs', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/import-export/_actions/master-data');

    const data = await withFakeOrg(client, () => mod.getImportableEntities(ORG_ID));

    expect(data).toEqual({
      org_id: ORG_ID,
      entities: [
        { key: 'finished_goods', label: 'Finished goods', row_count: 12, last_imported_at: '2026-06-05T12:00:00.000Z' },
        { key: 'components', label: 'Components', row_count: 42, last_imported_at: null },
        { key: 'boms', label: 'BOMs', row_count: 7, last_imported_at: '2026-06-04T08:00:00.000Z' },
        { key: 'suppliers', label: 'Suppliers', row_count: 5, last_imported_at: null },
      ],
      recent_jobs: [
        {
          id: IMPORT_JOB_ID,
          entity_key: 'finished_goods',
          entity_label: 'Finished goods',
          status: 'completed',
          rows_processed: 12,
          rows_total: 12,
          source_file_name: 'finished-goods.csv',
          created_at: '2026-06-05T12:00:00.000Z',
          completed_at: '2026-06-05T12:01:00.000Z',
        },
      ],
      // Recent EXPORT jobs (kind='export') — cross-module exports (e.g. the
      // Purchase Orders export-to-file action, target='purchase_orders') surface
      // verbatim so the export ledger is honest and downloadable.
      recent_exports: [
        {
          id: EXPORT_JOB_ID,
          target: 'purchase_orders',
          status: 'completed',
          rows_processed: 17,
          download_url: '/api/settings/import-export/jobs/' + EXPORT_JOB_ID,
          created_at: '2026-06-06T09:00:00.000Z',
        },
      ],
    });

    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.items i');
    expect(sql).toContain('from public.bom_headers h');
    expect(sql).toContain('from public.supplier_specs s');
    expect(sql).toContain('from public.import_export_jobs');
    expect(sql).toContain('app.current_org_id()');
    // The hub must read BOTH the import jobs (entity-scoped) and the export ledger
    // (kind='export', cross-module) so PO/etc. exports are not invisible.
    expect(sql).toContain("kind = 'import'");
    expect(sql).toContain("kind = 'export'");
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);

    const crossOrg = await withFakeOrg(client, () => mod.getImportableEntities(OTHER_ORG_ID));
    expect(crossOrg).toEqual({ org_id: ORG_ID, entities: [], recent_jobs: [], recent_exports: [] });
  });

  it('wires Label Templates list and producers through org-scoped label_templates rows', async () => {
    const client = makeClient();
    const mod = await import('../app/[locale]/(app)/(admin)/settings/labels/_actions/label-templates');

    const rows = await withFakeOrg(client, () => mod.getLabelTemplates(ORG_ID));
    const created = await withFakeOrg(client, () =>
      mod.createLabelTemplate({
        name: 'Case label',
        size: '100x150mm',
        used_on: 'Finished goods',
        status: 'active',
        elements: [{ type: 'text', value: 'LOT' }],
      }),
    );
    const updated = await withFakeOrg(client, () =>
      mod.updateLabelTemplate(LABEL_TEMPLATE_ID, {
        name: 'Case label',
        size: '100x150mm',
        used_on: 'Finished goods',
        status: 'active',
        elements: [{ type: 'text', value: 'LOT' }],
      }),
    );
    const duplicated = await withFakeOrg(client, () => mod.duplicateLabelTemplate(LABEL_TEMPLATE_ID));
    const deleted = await withFakeOrg(client, () => mod.deleteLabelTemplate(LABEL_TEMPLATE_ID));

    expect(rows).toEqual([
      {
        id: LABEL_TEMPLATE_ID,
        name: 'Case label',
        size: '100x150mm',
        used_on: 'Finished goods',
        updated_at: '2026-06-06T10:00:00.000Z',
        status: 'active',
      },
    ]);
    expect(created).toMatchObject({ ok: true, template: { id: LABEL_TEMPLATE_ID, org_id: ORG_ID, name: 'Case label' } });
    expect(updated).toMatchObject({ ok: true, template: { id: LABEL_TEMPLATE_ID, org_id: ORG_ID } });
    expect(duplicated).toMatchObject({ ok: true, template: { id: LABEL_TEMPLATE_ID, org_id: ORG_ID, status: 'draft' } });
    expect(deleted).toEqual({ ok: true, id: LABEL_TEMPLATE_ID });

    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('from public.label_templates');
    expect(sql).toContain('insert into public.label_templates');
    expect(sql).toContain('update public.label_templates');
    expect(sql).toContain('delete from public.label_templates');
    expect(sql).toContain('app.current_org_id()');
    expect(sql).toContain('from public.user_roles');
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/labels');

    const crossOrg = await withFakeOrg(client, () => mod.getLabelTemplates(OTHER_ORG_ID));
    expect(crossOrg).toEqual([]);
  });

  it('keeps new Settings data-layer tables in the local migration with org RLS and leaves the existing import/export client untouched', () => {
    const root = resolve(__dirname, '../../../');
    // Stale test contract: migrations use numbered filenames in this repo.
    const migration = readFileSync(resolve(root, 'packages/db/migrations/239-settings-import-export-labels.sql'), 'utf8');
    const existingClient = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/import-export/import-export-screen.client.tsx'),
      'utf8',
    );
    const masterDataActions = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/import-export/_actions/master-data.ts'),
      'utf8',
    );
    const labelActions = readFileSync(
      resolve(root, 'apps/web/app/[locale]/(app)/(admin)/settings/labels/_actions/label-templates.ts'),
      'utf8',
    );

    expect(migration).toContain('create table if not exists public.import_export_jobs');
    expect(migration).toContain('create table if not exists public.label_templates');
    expect(migration).toContain('org_id');
    expect(migration).toContain('app.current_org_id()');
    expect(migration).not.toContain('tenant_id');
    expect(masterDataActions).toContain('getImportableEntities');
    expect(masterDataActions).toContain('FLAG(settings-import-export-schema)');
    expect(labelActions).toContain('getLabelTemplates');
    expect(labelActions).toContain('createLabelTemplate');
    expect(labelActions).toContain('updateLabelTemplate');
    expect(labelActions).toContain('duplicateLabelTemplate');
    expect(labelActions).toContain('deleteLabelTemplate');
    expect(labelActions).toContain('FLAG(settings-label-templates-schema)');
    expect(existingClient).toContain('SettingsImportExportScreen');
  });
});
