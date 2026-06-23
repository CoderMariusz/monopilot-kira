/**
 * SET-PRN / E1 — `/settings/infra/printers` Printers settings page.
 *
 * Server Component: reads org-scoped printers + sites via withOrgContext, with the
 * settings.org.update permission resolved server-side (the SAME permission the
 * printers Server Actions enforce). Mutations are delegated to the real
 * `upsertPrinter` Server Action (owned by the E1 backend lane —
 * ./_actions/printers.ts — imported, never re-authored). Tests inject printers /
 * sites / canManage / state and an upsertPrinter stub to exercise the four UI
 * states + create / edit / deactivate without a live DB.
 *
 * i18n resolved server-side from the staged printers bundle (en + pl real, EN
 * fallback) — see ./printers-labels.ts. No inline JSX strings; no raw UUIDs.
 *
 * UI states: loading / empty-with-CTA / error / data + permission-denied.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { listPrinters, upsertPrinter as persistPrinter } from './_actions/printers';
import PrintersScreen, {
  type PageState,
  type PrinterRow,
  type PrintersLabels,
  type SiteOption,
  type UpsertPrinterInput,
} from './printers-screen.client';
import { getPrintersTranslator } from './printers-labels';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type PrintersPageProps = {
  params?: Promise<{ locale: string }>;
  printers?: PrinterRow[];
  sites?: SiteOption[];
  canManage?: boolean;
  state?: PageState;
  upsertPrinter?: (input: UpsertPrinterInput) => Promise<PrinterRow> | PrinterRow;
};

type LoaderResult = {
  state: PageState;
  printers: PrinterRow[];
  sites: SiteOption[];
  canManage: boolean;
};

type PrinterLoaderRow = {
  id: string;
  site_id: string | null;
  name: string;
  printer_type: 'pdf' | 'zpl';
  address: string | null;
  location: string | null;
  is_active: boolean;
};

type SiteLoaderRow = { id: string; site_code: string; name: string };

const LABEL_KEYS: Array<keyof PrintersLabels> = [
  'eyebrow',
  'title',
  'subtitle',
  'sectionTitle',
  'provenance',
  'addPrinter',
  'columnName',
  'columnType',
  'columnAddress',
  'columnLocation',
  'columnSite',
  'columnStatus',
  'columnActions',
  'typePdf',
  'typeZpl',
  'statusActive',
  'statusInactive',
  'edit',
  'deactivate',
  'activate',
  'addressNone',
  'locationNone',
  'siteNone',
  'dialogAddTitle',
  'dialogEditTitle',
  'fieldName',
  'fieldType',
  'fieldAddress',
  'fieldAddressHelp',
  'fieldLocation',
  'fieldLocationHelp',
  'fieldSite',
  'fieldSiteOrgWide',
  'save',
  'savePending',
  'cancel',
  'createSuccess',
  'saveFailed',
  'deactivateSuccess',
  'activateSuccess',
  'insufficientPermission',
  'loading',
  'empty',
  'emptyCta',
  'error',
  'forbidden',
];

function buildLabels(locale: string): PrintersLabels {
  const t = getPrintersTranslator(locale);
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(`settings.${key}`);
    return labels;
  }, {} as PrintersLabels);
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
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
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function loadPrintersPageData(): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;
      const canManage = await hasPermission(ctx, MANAGE_PERMISSION);
      if (!canManage) {
        return { state: 'permission_denied', printers: [], sites: [], canManage: false };
      }

      const [printersResult, sitesResult] = await Promise.all([
        ctx.client.query<PrinterLoaderRow>(
          `select id::text,
                  site_id::text,
                  name,
                  printer_type,
                  address,
                  location,
                  is_active
             from public.printers
            where org_id = app.current_org_id()
            order by is_active desc, lower(name)`,
        ),
        ctx.client.query<SiteLoaderRow>(
          `select id::text, site_code, name
             from public.sites
            where org_id = app.current_org_id()
              and is_active = true
            order by is_default desc, lower(name), lower(site_code)`,
        ),
      ]);

      const printers: PrinterRow[] = printersResult.rows.map((row) => ({
        id: row.id,
        site_id: row.site_id,
        name: row.name,
        printer_type: row.printer_type,
        address: row.address,
        location: row.location,
        is_active: row.is_active,
      }));
      const sites: SiteOption[] = sitesResult.rows.map((row) => ({ id: row.id, code: row.site_code, name: row.name }));

      return {
        state: printers.length === 0 ? 'empty' : 'ready',
        printers,
        sites,
        canManage: true,
      };
    });
  } catch (error) {
    console.error(
      '[settings/infra/printers] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', printers: [], sites: [], canManage: false };
  }
}

export default async function PrintersPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PrintersPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = buildLabels(locale);

  const hasInjected = Array.isArray(props.printers) || Array.isArray(props.sites) || props.state != null;
  const loaded: LoaderResult = hasInjected
    ? {
        state: props.state ?? ((props.printers?.length ?? 0) === 0 ? 'empty' : 'ready'),
        printers: props.printers ?? [],
        sites: props.sites ?? [],
        canManage: props.canManage ?? false,
      }
    : await loadPrintersPageData();

  return (
    <PrintersScreen
      initialPrinters={loaded.printers}
      sites={loaded.sites}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      upsertPrinter={props.upsertPrinter ?? persistPrinter}
    />
  );
}
