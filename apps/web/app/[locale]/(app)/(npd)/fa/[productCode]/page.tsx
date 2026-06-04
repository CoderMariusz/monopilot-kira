/**
 * FA detail page (RSC) — shell + tabs container.
 *
 * Route: /[locale]/(app)/(npd)/fa/[productCode]
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)
 *   - sticky header: breadcrumb eyebrow + FA code (mono) + product name +
 *     status_overall badge + ⚡ Built badge (prototype lines 330-353).
 *   - dept tab bar (subnav-inline, lines 387-398) → <FaTabs> tabs container.
 *
 * Real-data wiring (NO mocks):
 *   The FA core row (code/name/status_overall/built) AND the FA history timeline
 *   are read server-side inside `withOrgContext` — a single org-context
 *   transaction running as app_user with RLS pinned to app.current_org_id().
 *   RBAC (`npd.fa.read`) is resolved server-side; the client never re-queries
 *   and never trusts a client-side permission flag (permission_denied,
 *   not-found, and error are all server-resolved into discrete UI states).
 *
 * Tab content is intentionally deferred-empty for every department EXCEPT
 * History (T-027, kept intact) — the dept tab content lands in T-023..T-028.
 *
 * History parity source (kept from T-027):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:938-968 (FAHistoryTab)
 */

import { getTranslations } from 'next-intl/server';

import { listFaHistory, type FaHistoryEvent } from '@monopilot/queries';
import { Badge } from '@monopilot/ui/Badge';

import { FaTabs, type FaTabsLabels, type FaTabPanels } from './_components/fa-tabs';
import {
  FaHistoryTab,
  type FaHistoryLabels,
  type FaHistoryPageState,
  type FaHistoryRow,
} from './_components/fa-history-tab';
import { FaCoreTab, type FaCoreColumn, type FaCoreTabLabels } from './_components/fa-core-tab';
import {
  FaPlanningTab,
  type FaPlanningColumn,
  type FaPlanningTabLabels,
} from './_components/fa-planning-tab';
import {
  FaCommercialTab,
  type FaCommercialColumn,
  type FaCommercialTabLabels,
} from './_components/commercial-tab';
import {
  FaProductionTab,
  type FaProductionColumn,
  type FaProductionTabLabels,
  type ProdDetailRow,
} from './_components/fa-production-tab';
import {
  FaTechnicalTab,
  type FaTechnicalColumn,
  type FaTechnicalTabLabels,
} from './_components/fa-technical-tab';
import {
  FaProcurementTab,
  type FaProcurementColumn,
  type FaProcurementTabLabels,
} from './_components/fa-procurement-tab';
import {
  AllergenCascadeSection,
  buildAllergenLabels,
  loadAllergenCascade,
  type AllergenLoad,
} from './_lib/allergen-cascade';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type FaDetailPageProps = {
  params: Promise<{ locale: string; productCode: string }>;
  // Test-only injection seam (mirrors costing/page.tsx) for the History panel.
  historyRows?: FaHistoryRow[];
  historyState?: FaHistoryPageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.fa.read';

const STATUS_KEYS = ['Pending', 'InProgress', 'Alert', 'Complete', 'Built'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

// ---------------------------------------------------------------------------
// FA core row (real, org-scoped)
// ---------------------------------------------------------------------------

type FaCoreRow = {
  productCode: string;
  productName: string | null;
  statusOverall: string | null;
  built: boolean;
};

type FaDetailLoad =
  | { state: 'ready'; fa: FaCoreRow; history: HistoryLoad; dept: DeptData }
  | { state: 'empty' }
  | { state: 'permission_denied' }
  | { state: 'error' };

type HistoryLoad = { state: FaHistoryPageState; rows: FaHistoryRow[] };

// ---------------------------------------------------------------------------
// Schema-driven dept columns (T-014 runtime / Reference.DeptColumns) — the
// rendered field set per dept comes from live DeptColumns metadata (NOT a
// hardcoded list), read in the SAME org-context transaction (RLS-pinned).
// ---------------------------------------------------------------------------

/** Physical product/prod_detail columns that are AUTO-derived (read-only, green). */
const AUTO_DERIVED_KEYS = new Set<string>([
  'ingredient_codes',
  'equipment_setup',
  'intermediate_code_p1',
  'intermediate_code_p2',
  'intermediate_code_p3',
  'intermediate_code_p4',
  'intermediate_code_final',
]);
/** Physical columns that are read-only identifiers (PK), not auto-derived. */
const READONLY_ID_KEYS = new Set<string>(['product_code']);
/** Monospace-rendered Commercial columns (GS1 / bar codes). */
const MONO_KEYS = new Set<string>(['bar_codes']);

type GenericDeptColumn = {
  key: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'formula';
  required: boolean;
  readOnly: boolean;
  auto?: boolean;
  dropdownSource?: string;
  displayOrder: number;
  /** Procurement V-NPD-PROC-001 price gate. */
  priceGated?: boolean;
  /** Commercial monospace rendering. */
  mono?: boolean;
};

type DeptColumnRow = {
  column_key: string;
  physical_column: string;
  field_type: string | null;
  data_type: string | null;
  required_for_done: boolean | null;
  dropdown_source: string | null;
  blocking_rule: string | null;
  display_order: number | null;
};

/** Map a DeptColumns metadata row → a generic, render-ready column descriptor. */
function mapDeptColumn(row: DeptColumnRow, index: number): GenericDeptColumn {
  const key = row.physical_column;
  const hasDropdown = !!row.dropdown_source && row.dropdown_source.trim() !== '';
  const ft = (row.data_type ?? row.field_type ?? 'string').toLowerCase();
  const dataType: GenericDeptColumn['dataType'] = hasDropdown
    ? 'dropdown'
    : ft === 'number' || ft === 'integer'
      ? 'number'
      : ft === 'date' || ft === 'date-time'
        ? 'date'
        : ft === 'boolean'
          ? 'boolean'
          : ft === 'formula'
            ? 'formula'
            : 'text';
  const auto = AUTO_DERIVED_KEYS.has(key);
  const readOnly = auto || READONLY_ID_KEYS.has(key) || dataType === 'formula';
  return {
    key,
    dataType,
    required: row.required_for_done === true,
    readOnly,
    auto: auto || undefined,
    dropdownSource: hasDropdown ? (row.dropdown_source as string) : undefined,
    displayOrder: row.display_order ?? index,
    priceGated:
      key === 'price' && (row.blocking_rule ?? '').toLowerCase().includes('production')
        ? true
        : undefined,
    mono: MONO_KEYS.has(key) || undefined,
  };
}

async function readDeptColumns(
  ctx: OrgContextLike,
  deptCode: string,
): Promise<GenericDeptColumn[]> {
  const { rows } = await ctx.client.query<DeptColumnRow>(
    `select dc.column_key,
            lower(dc.column_key) as physical_column,
            dc.field_type,
            dc.data_type,
            dc.required_for_done,
            dc.dropdown_source,
            dc.blocking_rule,
            dc.display_order
       from "Reference"."DeptColumns" dc
      where dc.org_id = app.current_org_id()
        and lower(dc.dept_code) = lower($1)
      order by dc.display_order nulls last, dc.column_key`,
    [deptCode],
  );
  return rows.map((row, i) => mapDeptColumn(row, i));
}

/** Read the full product row as a JSON object keyed by physical column. */
async function readProductValues(
  ctx: OrgContextLike,
  productCode: string,
): Promise<Record<string, unknown>> {
  const { rows } = await ctx.client.query<{ product_json: Record<string, unknown> | null }>(
    `select to_jsonb(p.*) as product_json
       from public.product p
      where p.org_id = app.current_org_id()
        and p.product_code = $1
      limit 1`,
    [productCode],
  );
  return rows[0]?.product_json ?? {};
}

/** Read prod_detail component rows (Production tab) in display order. */
async function readProdDetailRows(
  ctx: OrgContextLike,
  productCode: string,
): Promise<ProdDetailRow[]> {
  const { rows } = await ctx.client.query<{ pd_json: Record<string, unknown> }>(
    `select to_jsonb(pd.*) as pd_json
       from public.prod_detail pd
      where pd.org_id = app.current_org_id()
        and pd.product_code = $1
      order by pd.component_index asc`,
    [productCode],
  );
  return rows.map((r) => {
    const json = r.pd_json ?? {};
    const id = String(json.id ?? json.component_index ?? '');
    const componentIndex = Number(json.component_index ?? 0);
    const weight = json.component_weight;
    return {
      id,
      componentIndex,
      intermediateCode: String(json.intermediate_code ?? ''),
      componentWeight: weight === null || weight === undefined ? null : Number(weight),
      // V06 yield-chain completeness is recomputed server-side elsewhere; default
      // to 'warn' until that snapshot is wired (read-only display flag).
      v06Status: 'warn',
      values: json,
    };
  });
}

type DeptData = {
  values: Record<string, unknown>;
  coreDone: boolean;
  prodDone: boolean;
  core: GenericDeptColumn[];
  planning: GenericDeptColumn[];
  commercial: GenericDeptColumn[];
  production: GenericDeptColumn[];
  technical: GenericDeptColumn[];
  procurement: GenericDeptColumn[];
  prodRows: ProdDetailRow[];
};

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

async function readFaCore(ctx: OrgContextLike, productCode: string): Promise<FaCoreRow | null> {
  // RLS pins org scope to app.current_org_id(); product_code is the PK.
  const { rows } = await ctx.client.query<{
    product_code: string;
    product_name: string | null;
    status_overall: string | null;
    built: boolean | null;
  }>(
    `select product_code, product_name, status_overall, built
       from public.product
      where product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    productCode: row.product_code,
    productName: row.product_name,
    statusOverall: row.status_overall,
    built: row.built === true,
  };
}

function toHistoryRow(event: FaHistoryEvent): FaHistoryRow {
  return {
    id: event.id,
    source: event.source,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    actorName: event.actorName,
    actorUserId: event.actorUserId,
    payload: event.payload,
  };
}

async function loadFaDetail(productCode: string): Promise<FaDetailLoad> {
  try {
    return await withOrgContext(async (rawCtx): Promise<FaDetailLoad> => {
      const ctx = rawCtx as OrgContextLike;

      if (!(await hasPermission(ctx, READ_PERMISSION))) {
        return { state: 'permission_denied' };
      }

      const fa = await readFaCore(ctx, productCode);
      if (!fa) {
        return { state: 'empty' };
      }

      // Schema-driven dept columns + the real product/prod_detail rows — all in
      // the SAME org-context transaction (single round-trip, RLS-pinned). The
      // field set per dept is whatever Reference.DeptColumns the org configured.
      const [
        values,
        core,
        planning,
        commercial,
        production,
        technical,
        procurement,
        prodRows,
      ] = await Promise.all([
        readProductValues(ctx, productCode),
        readDeptColumns(ctx, 'Core'),
        readDeptColumns(ctx, 'Planning'),
        readDeptColumns(ctx, 'Commercial'),
        readDeptColumns(ctx, 'Production'),
        readDeptColumns(ctx, 'Technical'),
        readDeptColumns(ctx, 'Procurement'),
        readProdDetailRows(ctx, productCode),
      ]);

      const coreDone = String(values.closed_core ?? '').toLowerCase() === 'yes';
      const prodDone = String(values.closed_production ?? '').toLowerCase() === 'yes';

      const dept: DeptData = {
        values,
        coreDone,
        prodDone,
        core,
        planning,
        commercial,
        production,
        technical,
        procurement,
        prodRows,
      };

      // History inside the SAME org-context transaction (no second round-trip).
      let history: HistoryLoad;
      try {
        const events = await listFaHistory(productCode, { client: ctx.client });
        const rows = events.map(toHistoryRow);
        history = { state: rows.length === 0 ? 'empty' : 'ready', rows };
      } catch (historyError) {
        console.error('[fa-detail] history read failed:', historyError);
        history = { state: 'error', rows: [] };
      }

      return { state: 'ready', fa, history, dept };
    });
  } catch (error) {
    console.error('[fa-detail] org-scoped read failed:', error);
    return { state: 'error' };
  }
}

// ---------------------------------------------------------------------------
// i18n label builders
// ---------------------------------------------------------------------------

type FaDetailLabels = {
  eyebrow: string;
  subtitle: string;
  built: string;
  empty: string;
  emptyBody: string;
  forbidden: string;
  error: string;
  status: Record<StatusKey, string>;
  tabs: FaTabsLabels;
};

const DEFAULT_FA_DETAIL_LABELS: FaDetailLabels = {
  eyebrow: 'Factory Article',
  subtitle: 'Department workspace · close each department to complete the FA',
  built: 'Built',
  empty: 'Factory Article not found',
  emptyBody: 'No Factory Article matches this code in your organisation.',
  forbidden: 'You do not have permission to view this Factory Article.',
  error: 'Unable to load this Factory Article.',
  status: {
    Pending: 'Pending',
    InProgress: 'In progress',
    Alert: 'Alert',
    Complete: 'Complete',
    Built: 'Built',
  },
  tabs: {
    tablistLabel: 'FA detail departments',
    tabs: {
      core: 'Core',
      planning: 'Planning',
      commercial: 'Commercial',
      production: 'Production',
      technical: 'Technical',
      mrp: 'MRP',
      procurement: 'Procurement',
      history: 'History',
    },
    deferred: 'Tab content deferred',
    deferredBody: 'This department workspace is delivered in a later slice.',
    locked: 'Locked',
  },
};

async function buildFaDetailLabels(locale: string): Promise<FaDetailLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faDetail' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const d = DEFAULT_FA_DETAIL_LABELS;
    return {
      eyebrow: pick('eyebrow', d.eyebrow),
      subtitle: pick('subtitle', d.subtitle),
      built: pick('built', d.built),
      empty: pick('empty', d.empty),
      emptyBody: pick('emptyBody', d.emptyBody),
      forbidden: pick('forbidden', d.forbidden),
      error: pick('error', d.error),
      status: {
        Pending: pick('status.Pending', d.status.Pending),
        InProgress: pick('status.InProgress', d.status.InProgress),
        Alert: pick('status.Alert', d.status.Alert),
        Complete: pick('status.Complete', d.status.Complete),
        Built: pick('status.Built', d.status.Built),
      },
      tabs: {
        tablistLabel: d.tabs.tablistLabel,
        tabs: {
          core: pick('tabs.core', d.tabs.tabs.core),
          planning: pick('tabs.planning', d.tabs.tabs.planning),
          commercial: pick('tabs.commercial', d.tabs.tabs.commercial),
          production: pick('tabs.production', d.tabs.tabs.production),
          technical: pick('tabs.technical', d.tabs.tabs.technical),
          mrp: pick('tabs.mrp', d.tabs.tabs.mrp),
          procurement: pick('tabs.procurement', d.tabs.tabs.procurement),
          history: pick('tabs.history', d.tabs.tabs.history),
        },
        deferred: pick('deferred', d.tabs.deferred),
        deferredBody: pick('deferredBody', d.tabs.deferredBody),
        locked: pick('tabs.locked', d.tabs.locked ?? 'Locked'),
      },
    };
  } catch {
    return DEFAULT_FA_DETAIL_LABELS;
  }
}

// History tab labels (npd.faHistory) — unchanged contract from T-027.
const DEFAULT_HISTORY_LABELS: FaHistoryLabels = {
  title: 'History',
  subtitle: 'Read-only timeline of every change to this Factory Article.',
  filterLabel: 'Event type',
  filterAll: 'All events',
  colWhen: 'When',
  colActor: 'Who',
  colEvent: 'Event',
  detailsToggle: 'Details',
  detailsHide: 'Hide details',
  systemActor: 'System',
  unknownActor: 'Unknown',
  loading: 'Loading FA history…',
  empty: 'No history yet',
  emptyBody: 'Changes to this Factory Article will appear here as they happen.',
  emptyFiltered: 'No events match this filter',
  emptyFilteredBody: 'Try a different event type or clear the filter.',
  clearFilter: 'Clear filter',
  error: 'Unable to load FA history.',
  forbidden: 'You do not have permission to view this FA history.',
  eventLabels: {},
};

const SCALAR_LABEL_KEYS = Object.keys(DEFAULT_HISTORY_LABELS).filter(
  (k) => k !== 'eventLabels',
) as Array<Exclude<keyof FaHistoryLabels, 'eventLabels'>>;

const EVENT_LABEL_KEYS = [
  'created',
  'field_edit',
  'edit',
  'dept_closed',
  'dept_reopened',
  'core_closed',
  'built',
  'built_reset',
  'allergens_changed',
  'intermediate_code_changed',
  'recipe_changed',
  'template_applied',
  'cascade',
  'deleted',
] as const;

async function buildHistoryLabels(locale: string): Promise<FaHistoryLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faHistory' });
    const labels: FaHistoryLabels = { ...DEFAULT_HISTORY_LABELS, eventLabels: {} };
    for (const key of SCALAR_LABEL_KEYS) {
      try {
        const value = t(key);
        labels[key] = value === key ? DEFAULT_HISTORY_LABELS[key] : value;
      } catch {
        labels[key] = DEFAULT_HISTORY_LABELS[key];
      }
    }
    const eventLabels: Record<string, string> = {};
    for (const key of EVENT_LABEL_KEYS) {
      try {
        const value = t(`type.${key}`);
        if (value && value !== `type.${key}`) eventLabels[key] = value;
      } catch {
        /* skip missing event label */
      }
    }
    labels.eventLabels = eventLabels;
    return labels;
  } catch {
    return { ...DEFAULT_HISTORY_LABELS };
  }
}

// ---------------------------------------------------------------------------
// Dept tab labels (English fallback; resolved through next-intl when keys exist).
// Mirrors the established faDetail/faHistory pick() fallback pattern: each visible
// string routes through getTranslations and falls back to the English default —
// no inline literals leak into the component tree.
// ---------------------------------------------------------------------------

type Picker = (key: string, fallback: string) => string;

async function pickerFor(locale: string, namespace: string): Promise<Picker> {
  try {
    const t = await getTranslations({ locale, namespace });
    return (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
  } catch {
    return (_key: string, fallback: string) => fallback;
  }
}

function fieldLabelsFor(columns: GenericDeptColumn[], pick: Picker): Record<string, string> {
  const map: Record<string, string> = {};
  for (const col of columns) {
    const humanized = col.key
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    map[col.key] = pick(`fields.${col.key}`, humanized);
  }
  return map;
}

async function buildCoreLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaCoreTabLabels> {
  const p = await pickerFor(locale, 'npd.faCoreTab');
  return {
    title: p('title', 'Core'),
    subtitle: p('subtitle', 'Core department details'),
    closedBadge: p('closedBadge', 'Closed'),
    openBadge: p('openBadge', 'Open'),
    autoHint: p('autoHint', 'Auto-derived'),
    requiredMissingTitle: p('requiredMissingTitle', 'Required fields missing'),
    requiredMissingBody: p('requiredMissingBody', 'Fill every required field before closing Core.'),
    save: p('save', 'Save Core'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    selectPlaceholder: p('selectPlaceholder', 'Select…'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No Core columns configured'),
    emptyBody: p('emptyBody', 'Configure Core columns in Settings.'),
    error: p('error', 'Unable to load Core.'),
    forbidden: p('forbidden', 'You cannot edit Core.'),
    fields: fieldLabelsFor(columns, p),
  };
}

async function buildPlanningLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaPlanningTabLabels> {
  const p = await pickerFor(locale, 'npd.faPlanningTab');
  return {
    title: p('title', 'Planning'),
    subtitle: p('subtitle', 'Planning department details'),
    closedBadge: p('closedBadge', 'Closed'),
    openBadge: p('openBadge', 'Open'),
    bomNoteTitle: p('bomNoteTitle', 'Technical BOM v1'),
    bomNoteBody: p('bomNoteBody', 'Planning fields transition into the Technical BOM.'),
    save: p('save', 'Save Planning'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    closeSection: p('closeSection', 'Close Planning'),
    selectPlaceholder: p('selectPlaceholder', 'Select…'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No Planning columns configured'),
    emptyBody: p('emptyBody', 'Configure Planning columns in Settings.'),
    error: p('error', 'Unable to load Planning.'),
    forbidden: p('forbidden', 'You cannot edit Planning.'),
    fields: fieldLabelsFor(columns, p),
  };
}

async function buildCommercialLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaCommercialTabLabels> {
  const p = await pickerFor(locale, 'npd.faCommercialTab');
  return {
    title: p('title', 'Commercial'),
    subtitle: p('subtitle', 'Commercial department details'),
    closedBadge: p('closedBadge', 'Closed'),
    openBadge: p('openBadge', 'Open'),
    v08Alert: p('v08Alert', 'Earliest launch date is {earliest}.'),
    v08Violation: p('v08Violation', 'Launch date must be on or after {earliest}.'),
    requiredMissingTitle: p('requiredMissingTitle', 'Required fields missing'),
    requiredMissingBody: p('requiredMissingBody', 'Fill every required field before closing Commercial.'),
    save: p('save', 'Save Commercial'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    close: p('close', 'Close Commercial'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No Commercial columns configured'),
    emptyBody: p('emptyBody', 'Configure Commercial columns in Settings.'),
    error: p('error', 'Unable to load Commercial.'),
    forbidden: p('forbidden', 'You cannot edit Commercial.'),
    fields: fieldLabelsFor(columns, p),
  };
}

async function buildProductionLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaProductionTabLabels> {
  const p = await pickerFor(locale, 'npd.faProductionTab');
  return {
    title: p('title', 'Production detail'),
    componentsCount: p('componentsCount', '{count} component(s)'),
    subtitle: p('subtitle', 'Edits reset the Built flag automatically.'),
    lockedTitle: p('lockedTitle', 'Blocked'),
    lockedBody: p('lockedBody', 'Pack Size must be filled in Core first.'),
    v06Pass: p('v06Pass', 'Yield OK'),
    v06Warn: p('v06Warn', 'Yield incomplete'),
    aggregateTitle: p('aggregateTitle', 'Aggregate'),
    autoHint: p('autoHint', 'Auto-derived'),
    singleComponent: p('singleComponent', 'Component'),
    save: p('save', 'Save Production'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    selectPlaceholder: p('selectPlaceholder', 'Select…'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No production components'),
    emptyBody: p('emptyBody', 'Production rows derive from Core recipe components.'),
    error: p('error', 'Unable to load Production.'),
    forbidden: p('forbidden', 'You cannot edit Production.'),
    fields: fieldLabelsFor(columns, p),
  };
}

async function buildTechnicalLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaTechnicalTabLabels> {
  const p = await pickerFor(locale, 'npd.faTechnicalTab');
  return {
    title: p('title', 'Technical'),
    subtitle: p('subtitle', 'Technical department details'),
    closedBadge: p('closedBadge', 'Closed'),
    openBadge: p('openBadge', 'Open'),
    autoHint: p('autoHint', 'Auto-derived'),
    requiredMissingTitle: p('requiredMissingTitle', 'Required fields missing'),
    requiredMissingBody: p('requiredMissingBody', 'Fill every required field before closing Technical.'),
    save: p('save', 'Save Technical'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    selectPlaceholder: p('selectPlaceholder', 'Select…'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No Technical columns configured'),
    emptyBody: p('emptyBody', 'Configure Technical columns in Settings.'),
    error: p('error', 'Unable to load Technical.'),
    forbidden: p('forbidden', 'You cannot edit Technical.'),
    allergenSlotTitle: p('allergenSlotTitle', 'Allergens'),
    allergenSlotSubtitle: p('allergenSlotSubtitle', 'Allergen cascade'),
    allergenSlotLoading: p('allergenSlotLoading', 'Loading allergens…'),
    fields: fieldLabelsFor(columns, p),
  };
}

async function buildProcurementLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaProcurementTabLabels> {
  const p = await pickerFor(locale, 'npd.faProcurementTab');
  return {
    title: p('title', 'Procurement'),
    subtitle: p('subtitle', 'Procurement department details'),
    closedBadge: p('closedBadge', 'Closed'),
    openBadge: p('openBadge', 'Open'),
    priceBlockedTitle: p('priceBlockedTitle', 'Price locked'),
    priceBlockedBody: p('priceBlockedBody', 'Close Core and Production before entering Price.'),
    priceBlockedHint: p('priceBlockedHint', 'Locked until Core + Production close.'),
    save: p('save', 'Save Procurement'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    selectPlaceholder: p('selectPlaceholder', 'Select…'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No Procurement columns configured'),
    emptyBody: p('emptyBody', 'Configure Procurement columns in Settings.'),
    error: p('error', 'Unable to load Procurement.'),
    forbidden: p('forbidden', 'You cannot edit Procurement.'),
    fields: fieldLabelsFor(columns, p),
  };
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function statusBadge(statusOverall: string | null, labels: FaDetailLabels) {
  if (!statusOverall) return null;
  const isKnown = (STATUS_KEYS as readonly string[]).includes(statusOverall);
  const label = isKnown ? labels.status[statusOverall as StatusKey] : statusOverall;
  const tone =
    statusOverall === 'Complete' || statusOverall === 'Built'
      ? 'success'
      : statusOverall === 'Alert'
        ? 'danger'
        : statusOverall === 'InProgress'
          ? 'warning'
          : 'muted';
  return (
    <Badge tone={tone} data-testid="fa-detail-status">
      {label}
    </Badge>
  );
}

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div
        role="alert"
        data-testid={testId}
        className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm"
      >
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {body ? <p className="mt-1 text-sm text-slate-600">{body}</p> : null}
      </div>
    </main>
  );
}

export default async function FaDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FaDetailPageProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const [labels, historyLabels] = await Promise.all([
    buildFaDetailLabels(locale),
    buildHistoryLabels(locale),
  ]);

  const injected = props.historyRows !== undefined || props.historyState !== undefined;

  const emptyDept: DeptData = {
    values: {},
    coreDone: false,
    prodDone: false,
    core: [],
    planning: [],
    commercial: [],
    production: [],
    technical: [],
    procurement: [],
    prodRows: [],
  };

  const load: FaDetailLoad = injected
    ? {
        state: 'ready',
        fa: { productCode, productName: null, statusOverall: null, built: false },
        history: {
          state:
            props.historyState ??
            (props.historyRows && props.historyRows.length > 0 ? 'ready' : 'empty'),
          rows: props.historyRows ?? [],
        },
        dept: emptyDept,
      }
    : await loadFaDetail(productCode);

  if (load.state === 'permission_denied') {
    return <StatePanel testId="fa-detail-forbidden" title={labels.forbidden} />;
  }
  if (load.state === 'error') {
    return <StatePanel testId="fa-detail-error" title={labels.error} />;
  }
  if (load.state === 'empty') {
    return <StatePanel testId="fa-detail-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const { fa, history, dept } = load;

  // Dept tab labels (English fallback via next-intl pick) + earliest launch date
  // (V08) computed server-side from the product's brief handoff.
  const [
    coreLabels,
    planningLabels,
    commercialLabels,
    productionLabels,
    technicalLabels,
    procurementLabels,
    allergenLabels,
  ] = await Promise.all([
    buildCoreLabels(locale, dept.core),
    buildPlanningLabels(locale, dept.planning),
    buildCommercialLabels(locale, dept.commercial),
    buildProductionLabels(locale, dept.production),
    buildTechnicalLabels(locale, dept.technical),
    buildProcurementLabels(locale, dept.procurement),
    buildAllergenLabels(locale),
  ]);

  // Allergen cascade (REAL, org-scoped) — read here so the BUILT T-040 widget is
  // reachable inside the Technical tab. Uses the reused readAllergenCascade
  // (own withOrgContext + RLS + server-resolved npd.allergen.write). Skipped for
  // the injected (test-only) path, which renders the reserved placeholder instead.
  const allergenLoad: AllergenLoad = injected
    ? { state: 'empty', data: null, canWrite: false, displayNames: {} }
    : await loadAllergenCascade(fa.productCode, locale);
  const allergenSlot = injected ? undefined : (
    <AllergenCascadeSection labels={allergenLabels} load={allergenLoad} />
  );

  const packSizeFilled = String(dept.values.pack_size ?? '').trim() !== '';
  const briefId = dept.values.brief_id != null ? String(dept.values.brief_id) : null;
  const closedCommercial =
    dept.values.closed_commercial != null ? String(dept.values.closed_commercial) : null;
  const closedCore = dept.values.closed_core != null ? String(dept.values.closed_core) : null;
  const closedProduction =
    dept.values.closed_production != null ? String(dept.values.closed_production) : null;
  // V08 earliest launch date is computed server-side from the brief handoff; the
  // value is not part of this slice's reads, so pass null (the rule is advisory
  // and re-enforced in updateFaCell). Wired by the Commercial parity slice.
  const earliestLaunch: string | null = null;

  const panels: FaTabPanels = {
    core: (
      <FaCoreTab
        productCode={fa.productCode}
        columns={dept.core as FaCoreColumn[]}
        values={dept.values}
        dropdowns={{}}
        labels={coreLabels}
        state="ready"
      />
    ),
    planning: (
      <FaPlanningTab
        productCode={fa.productCode}
        columns={dept.planning as FaPlanningColumn[]}
        values={dept.values}
        dropdowns={{}}
        labels={planningLabels}
        state="ready"
      />
    ),
    commercial: (
      <FaCommercialTab
        productCode={fa.productCode}
        columns={dept.commercial as FaCommercialColumn[]}
        values={dept.values}
        closedCommercial={closedCommercial}
        briefId={briefId}
        earliest={earliestLaunch}
        labels={commercialLabels}
        state="ready"
      />
    ),
    production: (
      <FaProductionTab
        productCode={fa.productCode}
        packSizeFilled={packSizeFilled}
        columns={dept.production as FaProductionColumn[]}
        rows={dept.prodRows}
        dropdowns={{}}
        labels={productionLabels}
        state="ready"
      />
    ),
    technical: (
      <FaTechnicalTab
        productCode={fa.productCode}
        columns={dept.technical as FaTechnicalColumn[]}
        values={dept.values}
        dropdowns={{}}
        labels={technicalLabels}
        state="ready"
        allergenSlot={allergenSlot}
      />
    ),
    procurement: (
      <FaProcurementTab
        productCode={fa.productCode}
        columns={dept.procurement as FaProcurementColumn[]}
        values={dept.values}
        dropdowns={{}}
        closedCore={closedCore}
        closedProduction={closedProduction}
        labels={procurementLabels}
        state="ready"
      />
    ),
    history: (
      <FaHistoryTab
        productCode={fa.productCode}
        rows={history.rows}
        labels={historyLabels}
        state={history.state}
      />
    ),
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <section
        aria-label={labels.eyebrow}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          {labels.eyebrow}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="font-mono text-lg font-bold tracking-tight text-blue-700">
            {fa.productCode}
          </span>
          <h1 className="text-xl font-semibold text-slate-950">
            {fa.productName ?? fa.productCode}
          </h1>
          {statusBadge(fa.statusOverall, labels)}
          {fa.built ? (
            <Badge tone="info" data-testid="fa-detail-built">
              {'⚡ '}
              {labels.built}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-slate-600">{labels.subtitle}</p>
      </section>

      <FaTabs
        productCode={fa.productCode}
        labels={labels.tabs}
        panels={panels}
        coreDone={dept.coreDone}
        prodDone={dept.prodDone}
      />
    </main>
  );
}
