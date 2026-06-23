'use server';

import { z } from 'zod';

import { buildGs1Element, type Gs1BuildInput } from '../../../../../../../../../../packages/gs1/src/build.js';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';
// TODO(E1): dedicated warehouse.label.print permission.

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type PrinterType = 'pdf' | 'zpl';
export type PrintJobStatus = 'queued' | 'sent' | 'failed';

export type PrinterRow = {
  id: string;
  org_id: string;
  site_id: string | null;
  name: string;
  printer_type: PrinterType;
  address: string | null;
  location: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PrintJobRow = {
  id: string;
  org_id: string;
  site_id: string | null;
  printer_id: string | null;
  template_id: string | null;
  entity_type: string;
  entity_id: string | null;
  copies: number;
  payload: Record<string, unknown>;
  status: PrintJobStatus;
  error_text: string | null;
  result_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PrintJobListRow = PrintJobRow & {
  printer_name: string | null;
  entity_display: string;
  lp_code: string | null;
};

type PrinterDbRow = Omit<PrinterRow, 'created_at' | 'updated_at'> & {
  created_at: string | Date;
  updated_at: string | Date;
};

type PrintJobDbRow = Omit<PrintJobRow, 'created_at' | 'updated_at' | 'payload'> & {
  payload: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type PrintJobListDbRow = PrintJobDbRow & {
  printer_name: string | null;
  entity_display: string | null;
  lp_code: string | null;
};

type PrinterModeRow = {
  id: string;
  printer_type: PrinterType;
  site_id: string | null;
  name: string;
};

type LicensePlateLabelRow = {
  entity_id: string;
  site_id: string | null;
  lp_code: string;
  item_id: string;
  gs1_gtin: string | null;
  batch_lot: string | null;
  expiry_date: string | null;
  catch_weight_kg: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);
const OptionalUuidInput = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return null;
  return value;
}, UuidInput.nullable());
const OptionalTextInput = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return null;
  return value;
}, z.string().trim().min(1).max(240).nullable());

const UpsertPrinterInput = z
  .object({
    id: OptionalUuidInput.optional(),
    name: z.string().trim().min(1).max(160),
    printer_type: z.enum(['pdf', 'zpl']),
    address: OptionalTextInput.optional(),
    location: OptionalTextInput.optional(),
    site_id: OptionalUuidInput.optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

const PrintLabelInput = z
  .object({
    entityType: z.string().trim().min(1).max(80),
    entityId: UuidInput,
    templateId: OptionalUuidInput.optional(),
    printerId: OptionalUuidInput.optional(),
    copies: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const ListPrintJobsInput = z
  .object({
    status: z.enum(['queued', 'sent', 'failed']).optional(),
  })
  .strict();

export type UpsertPrinterInput = z.input<typeof UpsertPrinterInput>;
export type PrintLabelInput = z.input<typeof PrintLabelInput>;
export type ListPrintJobsInput = z.input<typeof ListPrintJobsInput>;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toPrinterRow(row: PrinterDbRow): PrinterRow {
  return {
    ...row,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function toPrintJobRow(row: PrintJobDbRow): PrintJobRow {
  return {
    ...row,
    payload: asRecord(row.payload),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function toPrintJobListRow(row: PrintJobListDbRow): PrintJobListRow {
  return {
    ...toPrintJobRow(row),
    printer_name: row.printer_name,
    entity_display: row.entity_display ?? row.entity_type,
    lp_code: row.lp_code,
  };
}

function toGs1Expiry(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return `${match[1].slice(2)}${match[2]}${match[3]}`;
}

function toGs1NetWeightKg(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function hasSettingsUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, SETTINGS_UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

async function assertCanUsePrinters(context: OrgContextLike): Promise<void> {
  if (!(await hasSettingsUpdatePermission(context))) {
    throw new Error('forbidden');
  }
}

async function loadPrinterMode(client: QueryClient, printerId: string | null): Promise<PrinterModeRow | null> {
  if (!printerId) return null;
  const { rows } = await client.query<PrinterModeRow>(
    `select id::text, printer_type, site_id::text, name
       from public.printers
      where org_id = app.current_org_id()
        and id = $1::uuid
        and is_active = true
      limit 1`,
    [printerId],
  );
  const row = rows[0] ?? null;
  if (!row) throw new Error('printer_not_found');
  return row;
}

async function loadLicensePlateForLabel(client: QueryClient, entityId: string): Promise<LicensePlateLabelRow> {
  const { rows } = await client.query<LicensePlateLabelRow>(
    `select lp.id::text as entity_id,
            lp.site_id::text,
            coalesce(lp.lp_code, lp.lp_number) as lp_code,
            lp.product_id::text as item_id,
            i.gs1_gtin,
            coalesce(lp.batch_number, lp.supplier_batch_number) as batch_lot,
            lp.expiry_date::date::text as expiry_date,
            lp.catch_weight_kg::text
       from public.license_plates lp
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = lp.product_id
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
      limit 1`,
    [entityId],
  );
  const row = rows[0];
  if (!row) throw new Error('entity_not_found');
  return row;
}

function buildLpPayload(lp: LicensePlateLabelRow): Record<string, unknown> {
  const gs1Input: Gs1BuildInput = {};
  if (lp.gs1_gtin) gs1Input.gtin = lp.gs1_gtin;
  if (lp.batch_lot) gs1Input.lot = lp.batch_lot;
  const expiry = toGs1Expiry(lp.expiry_date);
  if (expiry) gs1Input.expiry = expiry;
  const netWeightKg = toGs1NetWeightKg(lp.catch_weight_kg);
  if (netWeightKg !== undefined) gs1Input.netWeightKg = netWeightKg;
  const hasGs1Input = Object.keys(gs1Input).length > 0;
  const gs1Element = hasGs1Input ? buildGs1Element(gs1Input) : null;

  const payload: Record<string, unknown> = {
    entity_type: 'lp',
    entity_id: lp.entity_id,
    lp_code: lp.lp_code,
    item_id: lp.item_id,
    gs1_gtin: lp.gs1_gtin,
    lot: lp.batch_lot,
    expiry_date: lp.expiry_date,
    catch_weight_kg: lp.catch_weight_kg,
    gs1_element_string: gs1Element?.raw ?? null,
    gs1_raw: gs1Element?.raw ?? null,
    gs1_human: gs1Element?.human ?? null,
    gs1_fields: {
      gtin: lp.gs1_gtin,
      lot: lp.batch_lot,
      expiry_date: lp.expiry_date,
      catch_weight_kg: lp.catch_weight_kg,
      lp_code: lp.lp_code,
    },
  };

  if (!lp.gs1_gtin) payload.gtin_missing = true;
  return payload;
}

function dataTextResultUrl(payload: Record<string, unknown>): string {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
}

async function insertPrintJob(
  context: OrgContextLike,
  input: {
    siteId: string | null;
    printerId: string | null;
    templateId: string | null;
    entityType: string;
    entityId: string | null;
    copies: number;
    payload: Record<string, unknown>;
    status: PrintJobStatus;
    resultUrl: string | null;
  },
): Promise<PrintJobRow> {
  const { rows } = await context.client.query<PrintJobDbRow>(
    `insert into public.print_jobs
       (org_id, site_id, printer_id, template_id, entity_type, entity_id, copies, payload, status, result_url, created_by)
     values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::integer, $7::jsonb, $8, $9, $10::uuid)
     returning id::text,
               org_id::text,
               site_id::text,
               printer_id::text,
               template_id::text,
               entity_type,
               entity_id::text,
               copies,
               payload,
               status,
               error_text,
               result_url,
               created_by::text,
               created_at,
               updated_at`,
    [
      input.siteId,
      input.printerId,
      input.templateId,
      input.entityType,
      input.entityId,
      input.copies,
      JSON.stringify(input.payload),
      input.status,
      input.resultUrl,
      context.userId,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('persistence_failed');
  return toPrintJobRow(row);
}

export async function upsertPrinter(rawInput: UpsertPrinterInput): Promise<PrinterRow> {
  const input = UpsertPrinterInput.parse(rawInput);
  return withOrgContext<PrinterRow>(async (ctx): Promise<PrinterRow> => {
    const context = ctx as OrgContextLike;
    await assertCanUsePrinters(context);

    if (input.id) {
      const { rows } = await context.client.query<PrinterDbRow>(
        `update public.printers
            set site_id = $2::uuid,
                name = $3,
                printer_type = $4,
                address = $5,
                location = $6,
                is_active = $7::boolean,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id::text,
                    org_id::text,
                    site_id::text,
                    name,
                    printer_type,
                    address,
                    location,
                    is_active,
                    created_by::text,
                    created_at,
                    updated_at`,
        [
          input.id,
          input.site_id ?? null,
          input.name,
          input.printer_type,
          input.address ?? null,
          input.location ?? null,
          input.is_active ?? true,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('printer_not_found');
      return toPrinterRow(row);
    }

    const { rows } = await context.client.query<PrinterDbRow>(
      `insert into public.printers
         (org_id, site_id, name, printer_type, address, location, is_active, created_by)
       values (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6::boolean, $7::uuid)
       returning id::text,
                 org_id::text,
                 site_id::text,
                 name,
                 printer_type,
                 address,
                 location,
                 is_active,
                 created_by::text,
                 created_at,
                 updated_at`,
      [
        input.site_id ?? null,
        input.name,
        input.printer_type,
        input.address ?? null,
        input.location ?? null,
        input.is_active ?? true,
        context.userId,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('persistence_failed');
    return toPrinterRow(row);
  });
}

export async function listPrinters(): Promise<PrinterRow[]> {
  return withOrgContext<PrinterRow[]>(async (ctx): Promise<PrinterRow[]> => {
    const context = ctx as OrgContextLike;
    await assertCanUsePrinters(context);

    const { rows } = await context.client.query<PrinterDbRow>(
      `select id::text,
              org_id::text,
              site_id::text,
              name,
              printer_type,
              address,
              location,
              is_active,
              created_by::text,
              created_at,
              updated_at
         from public.printers
        where org_id = app.current_org_id()
        order by is_active desc, lower(name), created_at desc`,
    );
    return rows.map(toPrinterRow);
  });
}

export async function printLabel(rawInput: PrintLabelInput): Promise<PrintJobRow> {
  const input = PrintLabelInput.parse(rawInput);
  if (input.entityType !== 'lp') throw new Error('unsupported_entity_type');

  return withOrgContext<PrintJobRow>(async (ctx): Promise<PrintJobRow> => {
    const context = ctx as OrgContextLike;
    await assertCanUsePrinters(context);

    const printer = await loadPrinterMode(context.client, input.printerId ?? null);
    const lp = await loadLicensePlateForLabel(context.client, input.entityId);
    const payload = buildLpPayload(lp);
    const printerType = printer?.printer_type ?? 'pdf';
    const status: PrintJobStatus = printerType === 'pdf' ? 'sent' : 'queued';
    const resultUrl = printerType === 'pdf' ? dataTextResultUrl(payload) : null;

    return insertPrintJob(context, {
      siteId: printer?.site_id ?? lp.site_id,
      printerId: printer?.id ?? null,
      templateId: input.templateId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      copies: input.copies ?? 1,
      payload,
      status,
      resultUrl,
    });
  });
}

export async function listPrintJobs(rawInput: ListPrintJobsInput = {}): Promise<PrintJobListRow[]> {
  const input = ListPrintJobsInput.parse(rawInput ?? {});
  return withOrgContext<PrintJobListRow[]>(async (ctx): Promise<PrintJobListRow[]> => {
    const context = ctx as OrgContextLike;
    await assertCanUsePrinters(context);

    const { rows } = await context.client.query<PrintJobListDbRow>(
      `select pj.id::text,
              pj.org_id::text,
              pj.site_id::text,
              pj.printer_id::text,
              pj.template_id::text,
              pj.entity_type,
              pj.entity_id::text,
              pj.copies,
              pj.payload,
              pj.status,
              pj.error_text,
              pj.result_url,
              pj.created_by::text,
              pj.created_at,
              pj.updated_at,
              p.name as printer_name,
              lp.lp_code,
              case
                when pj.entity_type = 'lp' then coalesce(lp.lp_code, lp.lp_number, 'License plate')
                else pj.entity_type
              end as entity_display
         from public.print_jobs pj
         left join public.printers p
           on p.org_id = app.current_org_id()
          and p.id = pj.printer_id
         left join public.license_plates lp
           on lp.org_id = app.current_org_id()
          and pj.entity_type = 'lp'
          and lp.id = pj.entity_id
        where pj.org_id = app.current_org_id()
          and ($1::text is null or pj.status = $1)
        order by pj.created_at desc, pj.id desc
        limit 100`,
      [input.status ?? null],
    );
    return rows.map(toPrintJobListRow);
  });
}

export async function reprintFromHistory(jobId: string): Promise<PrintJobRow> {
  const parsedJobId = UuidInput.parse(jobId);
  return withOrgContext<PrintJobRow>(async (ctx): Promise<PrintJobRow> => {
    const context = ctx as OrgContextLike;
    await assertCanUsePrinters(context);

    const { rows } = await context.client.query<
      PrintJobDbRow & { printer_type: PrinterType | null; printer_site_id: string | null }
    >(
      `select pj.id::text,
              pj.org_id::text,
              pj.site_id::text,
              pj.printer_id::text,
              pj.template_id::text,
              pj.entity_type,
              pj.entity_id::text,
              pj.copies,
              pj.payload,
              pj.status,
              pj.error_text,
              pj.result_url,
              pj.created_by::text,
              pj.created_at,
              pj.updated_at,
              p.printer_type,
              p.site_id::text as printer_site_id
         from public.print_jobs pj
         left join public.printers p
           on p.org_id = app.current_org_id()
          and p.id = pj.printer_id
        where pj.org_id = app.current_org_id()
          and pj.id = $1::uuid
        limit 1`,
      [parsedJobId],
    );
    const source = rows[0];
    if (!source) throw new Error('print_job_not_found');

    const payload = asRecord(source.payload);
    const printerType = source.printer_type ?? 'zpl';
    const status: PrintJobStatus = printerType === 'pdf' ? 'sent' : 'queued';
    const resultUrl = printerType === 'pdf' ? dataTextResultUrl(payload) : null;

    return insertPrintJob(context, {
      siteId: source.printer_site_id ?? source.site_id,
      printerId: source.printer_id,
      templateId: source.template_id,
      entityType: source.entity_type,
      entityId: source.entity_id,
      copies: source.copies,
      payload,
      status,
      resultUrl,
    });
  });
}
