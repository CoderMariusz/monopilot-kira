import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildGs1Element, type Gs1BuildInput } from '@monopilot/gs1/build';

import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonOk, readJson, stringField } from '../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../lib/scanner/with-scanner-org';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
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

type PrintJobDbRow = {
  id: string;
  status: 'queued' | 'sent' | 'failed';
  result_url: string | null;
};

const PRINT_LABEL_PERMISSIONS = [
  'settings.org.update',
  'warehouse.grn.receive',
  'warehouse.stock.move',
  'production.output.write',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

async function hasPrintPermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const permissions = [...PRINT_LABEL_PERMISSIONS];
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = any($3::text[])
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
        )
      limit 1`,
    [userId, orgId, permissions],
  );
  return rows.length > 0;
}

async function loadLicensePlateForLabel(client: QueryClient, entityId: string): Promise<LicensePlateLabelRow | null> {
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
        and app.user_can_see_site(lp.site_id)
      limit 1`,
    [entityId],
  );
  return rows[0] ?? null;
}

function toGs1Expiry(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return `${match[1].slice(2)}${match[2]}${match[3]}`;
}

function toGs1NetWeightKg(catchWeightKg: string | null): number | undefined {
  if (!catchWeightKg) return undefined;
  const parsed = Number(catchWeightKg);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  client: QueryClient,
  input: {
    siteId: string | null;
    entityId: string;
    payload: Record<string, unknown>;
    resultUrl: string;
    userId: string;
  },
): Promise<PrintJobDbRow> {
  const { rows } = await client.query<PrintJobDbRow>(
    `insert into public.print_jobs
       (org_id, site_id, printer_id, template_id, entity_type, entity_id, copies, payload, status, result_url, created_by)
     values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::integer, $7::jsonb, $8, $9, $10::uuid)
     returning id::text,
               status,
               result_url`,
    [
      input.siteId,
      null,
      null,
      'lp',
      input.entityId,
      1,
      JSON.stringify(input.payload),
      'sent',
      input.resultUrl,
      input.userId,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('persistence_failed');
  return row;
}

function isForbiddenDbError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';
  return code === '42501' || message.includes('permission denied') || message.includes('row-level security');
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (!isRecord(body)) return errorResponse('Invalid request', 400);

    const lpId = stringField(body, 'lpId');
    if (!lpId || !UUID_RE.test(lpId)) return errorResponse('Invalid request', 400);

    const result = await requireScannerSession(request, body, 'scanner.print_label', async ({ client, session }) =>
      withScannerOrg(client, session, async ({ client: scopedClient }) =>
        withTxnOrgContext(scopedClient, session.org_id, session.user_id, async () => {
          if (!(await hasPrintPermission(scopedClient, session.user_id, session.org_id))) {
            return errorResponse('Forbidden', 403);
          }

          const lp = await loadLicensePlateForLabel(scopedClient, lpId);
          if (!lp) return errorResponse('LP not found', 404);

          const payload = buildLpPayload(lp);
          const resultUrl = dataTextResultUrl(payload);
          const job = await insertPrintJob(scopedClient, {
            siteId: lp.site_id,
            entityId: lpId,
            payload,
            resultUrl,
            userId: session.user_id,
          });

          return jsonOk({ job });
        }),
      ),
    );

    if ('guardError' in result) return errorResponse(result.error, result.status);
    return result;
  } catch (error) {
    if (isForbiddenDbError(error)) return errorResponse('Forbidden', 403);
    return errorResponse('Print label failed', 500);
  }
}
