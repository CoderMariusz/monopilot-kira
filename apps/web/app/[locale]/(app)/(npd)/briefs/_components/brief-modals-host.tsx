/**
 * T-121 — Brief modals server host (wiring).
 *
 * Server Component that mounts the merged T-035 BriefModals (Create + Complete)
 * into the briefs list route. It bridges the RSC boundary to the client
 * `?modal=` host:
 *
 *   - resolves RBAC server-side (brief.create / brief.convert_to_fa) and injects
 *     the real Server Actions ONLY when permitted (never render-then-disable),
 *   - server-fetches the read-only complete-summary for the brief named in the
 *     `?brief=<id>` query param (the trigger the list pushes for Convert/Complete),
 *   - builds the modal labels (next-intl with graceful prototype fallback).
 *
 * The list-table (T-119) pushes `?modal=briefCreate` and
 * `?modal=briefConvert&brief=<id>`; this host turns those URL states into the
 * injected modals. Server Actions are imported (T-031 createBrief, T-033
 * completeBriefForProject) — never authored here. No mocks; summary is a real
 * org-scoped read via withOrgContext (RLS as app_user).
 */

import { getTranslations } from 'next-intl/server';

import {
  BriefModals,
  type BriefModalsProps,
} from '../../../../../(npd)/_modals/brief-modals';
import type {
  BriefCreateLabels,
  BriefTemplate,
} from '../../../../../(npd)/_modals/brief-create-modal';
import type {
  BriefCompleteLabels,
  BriefCompleteStatus,
  BriefCompleteSummary,
  BriefSummaryRow,
} from '../../../../../(npd)/_modals/brief-complete-modal';
import { createBrief } from '../../../../../(npd)/brief/actions/create-brief';
import { completeBriefForProject } from '../../../../../(npd)/brief/actions/convert-brief-to-fa';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const CREATE_PERMISSION = 'brief.create';
const CONVERT_PERMISSION = 'brief.convert_to_fa';

const DEFAULT_CREATE_LABELS: BriefCreateLabels = {
  title: 'New brief',
  subtitle: 'Creates a Brief and a linked NPD project at G0.',
  templateLabel: 'Template',
  templateSingle: 'Single component',
  templateSingleHint: 'One Finish Meat / one component',
  templateMulti: 'Multi component',
  templateMultiHint: 'Platters, mixed packs (2+ components)',
  fieldDevCode: 'Dev Code',
  fieldDevCodeHint: 'V08 · Format DEV<YY><MM>-<seq>',
  projectNote: 'A Brief creates a linked NPD project at G0. FG mapping happens later at G3.',
  cancel: 'Cancel',
  create: 'Create brief',
  creating: 'Creating…',
  errorDevCode: 'Invalid Dev Code format (e.g. DEV26-052).',
  errorGeneric: 'Could not create the brief. Try again.',
};

const DEFAULT_COMPLETE_LABELS: BriefCompleteLabels = {
  title: 'Complete brief for project',
  subtitle: 'Gate checks pass — the brief is complete and required fields are filled.',
  gateChecksTitle: 'Gate checks',
  gateCheckStatus: 'Brief status = complete',
  gateCheckRequired: 'All required fields filled',
  gateCheckDevCode: 'Dev code format valid (V08)',
  summaryHeader: 'Brief evidence carried to the project',
  colField: 'Field',
  colValue: 'Value from brief',
  legacyAliasLabel: 'Legacy alias (optional)',
  legacyAliasHint: 'Compatibility only — not an approved FG. FG mapping happens at G3.',
  errorLegacyAlias: 'Legacy alias is too long (max 80).',
  lockingWarning: 'The brief will be set to Converted and locked. Project evidence remains editable.',
  emptyValue: '—',
  cancel: 'Cancel',
  complete: 'Complete brief for project',
  completing: 'Completing…',
  loading: 'Loading brief summary…',
  empty: 'No summary available for this brief.',
  error: 'Unable to load the brief summary. Try again.',
  forbidden: 'You do not have permission to complete this brief.',
  errorGeneric: 'Could not complete the brief. Try again.',
};

const CREATE_KEYS = Object.keys(DEFAULT_CREATE_LABELS) as Array<keyof BriefCreateLabels>;
const COMPLETE_KEYS = Object.keys(DEFAULT_COMPLETE_LABELS) as Array<keyof BriefCompleteLabels>;

function pick<T extends Record<string, string>>(
  t: (key: string) => string,
  keys: Array<keyof T>,
  fallback: T,
): T {
  return keys.reduce((acc, key) => {
    try {
      const value = t(key as string);
      acc[key] = (value === key ? fallback[key] : (value as T[keyof T])) as T[keyof T];
    } catch {
      acc[key] = fallback[key];
    }
    return acc;
  }, {} as T);
}

async function buildCreateLabels(locale: string): Promise<BriefCreateLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.briefCreateModal' });
    return pick<BriefCreateLabels>(t, CREATE_KEYS, DEFAULT_CREATE_LABELS);
  } catch {
    return { ...DEFAULT_CREATE_LABELS };
  }
}

async function buildCompleteLabels(locale: string): Promise<BriefCompleteLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.briefCompleteModal' });
    return pick<BriefCompleteLabels>(t, COMPLETE_KEYS, DEFAULT_COMPLETE_LABELS);
  } catch {
    return { ...DEFAULT_COMPLETE_LABELS };
  }
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

type SummaryHeaderRow = {
  brief_id: string;
  dev_code: string;
  product_name: string | null;
  template: string;
  status: string;
  volume: string | null;
  packs_per_case: number | null;
  comments: string | null;
};

type ResolvedComplete = {
  canConvert: boolean;
  status: BriefCompleteStatus;
  summary: BriefCompleteSummary | null;
};

/**
 * Server-fetches the read-only complete-summary for `?brief=<id>` (org-scoped,
 * RLS-enforced). Returns a `BriefCompleteStatus` the client modal renders without
 * trusting any client-supplied permission.
 */
async function resolveComplete(briefId: string | null): Promise<ResolvedComplete> {
  try {
    return await withOrgContext(async (rawCtx): Promise<ResolvedComplete> => {
      const ctx = rawCtx as OrgContextLike;
      const canConvert = await hasPermission(ctx, CONVERT_PERMISSION);
      if (!canConvert) return { canConvert, status: 'forbidden', summary: null };
      if (!briefId) return { canConvert, status: 'empty', summary: null };

      const { rows } = await ctx.client.query<SummaryHeaderRow>(
        `select b.brief_id::text as brief_id,
                b.dev_code,
                b.product_name,
                b.template,
                b.status,
                pl.volume::text  as volume,
                pl.packs_per_case,
                pl.comments
           from public.brief b
           left join public.brief_lines pl
             on pl.brief_id = b.brief_id
            and pl.org_id = b.org_id
            and pl.line_type = 'product'
          where b.brief_id = $1::uuid
            and b.org_id = app.current_org_id()
          limit 1`,
        [briefId],
      );
      const head = rows[0];
      if (!head) return { canConvert, status: 'empty', summary: null };

      const summaryRows: BriefSummaryRow[] = [
        { key: 'devCode', field: 'Dev Code', value: head.dev_code },
        { key: 'productName', field: 'Product name', value: head.product_name },
        {
          key: 'template',
          field: 'Template',
          value: head.template === 'multi_component' ? 'Multi component' : 'Single component',
        },
        { key: 'volume', field: 'Volume (pcs/week)', value: head.volume },
        {
          key: 'packsPerCase',
          field: 'Packs per case',
          value: head.packs_per_case == null ? null : String(head.packs_per_case),
        },
        { key: 'comments', field: 'Comments', value: head.comments },
      ];

      const summary: BriefCompleteSummary = {
        briefId: head.brief_id,
        devCode: head.dev_code,
        productName: head.product_name,
        rows: summaryRows,
      };
      return { canConvert, status: 'ready', summary };
    });
  } catch (error) {
    console.error('[brief-modals-host] complete-summary read failed:', error);
    return { canConvert: false, status: 'error', summary: null };
  }
}

async function resolveCanCreate(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      return hasPermission(ctx, CREATE_PERMISSION);
    });
  } catch (error) {
    console.error('[brief-modals-host] canCreate read failed:', error);
    return false;
  }
}

// Server Action adapter for create (RHF → T-031 createBrief enum/devCode).
async function createBriefAction(template: BriefTemplate, devCode: string) {
  'use server';
  return createBrief(template, devCode);
}

// Server Action adapter for complete/convert (T-033 completeBriefForProject).
async function completeBriefAction(briefId: string, legacyAlias?: string | null) {
  'use server';
  return completeBriefForProject(briefId, legacyAlias ?? null);
}

export type BriefModalsHostProps = {
  locale: string;
  /** The `?brief=<id>` param the list pushes for Convert/Complete (null otherwise). */
  briefId?: string | null;
  // Test-only injection seam (mirrors the page loaders' convention). When any of
  // these is provided, the server reads are bypassed.
  canCreate?: boolean;
  completeStatus?: BriefCompleteStatus;
  completeSummary?: BriefCompleteSummary | null;
};

export async function BriefModalsHost(propsInput: unknown = {}): Promise<React.ReactElement> {
  const props = (propsInput ?? {}) as BriefModalsHostProps;
  const locale = props.locale ?? 'en';
  const briefId = props.briefId ?? null;

  const injected =
    props.canCreate !== undefined ||
    props.completeStatus !== undefined ||
    props.completeSummary !== undefined;

  const [createLabels, completeLabels] = await Promise.all([
    buildCreateLabels(locale),
    buildCompleteLabels(locale),
  ]);

  let canCreate: boolean;
  let completeStatus: BriefCompleteStatus;
  let completeSummary: BriefCompleteSummary | null;

  if (injected) {
    canCreate = props.canCreate ?? false;
    completeStatus = props.completeStatus ?? 'empty';
    completeSummary = props.completeSummary ?? null;
  } else {
    const [createOk, complete] = await Promise.all([resolveCanCreate(), resolveComplete(briefId)]);
    canCreate = createOk;
    completeStatus = complete.status;
    completeSummary = complete.summary;
  }

  // RBAC: inject the Server Action ONLY when permitted. The client modal stays a
  // pure form; it can never complete/create what the server would reject.
  const props2: BriefModalsProps = {
    createLabels,
    completeLabels,
    createBriefAction: canCreate ? createBriefAction : undefined,
    completeBriefAction:
      completeStatus !== 'forbidden' && completeStatus !== 'error' ? completeBriefAction : undefined,
    completeStatus,
    completeSummary,
  };

  return <BriefModals {...props2} />;
}

export default BriefModalsHost;
