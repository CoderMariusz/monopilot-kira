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

import { FaTabs, type FaTabsLabels, type FaTabPanels } from './_components/fa-tabs';
import {
  FaHistoryTab,
  type FaHistoryLabels,
  type FaHistoryPageState,
  type FaHistoryRow,
} from './_components/fa-history-tab';
import { FaCoreTab, type FaCoreColumn, type FaCoreTabLabels } from './_components/fa-core-tab';
import {
  FinishWipEditor,
  type FinishWipEditorLabels,
} from './_components/finish-wip-editor';
import {
  BenchmarkEditor,
  type BenchmarkEditorLabels,
  type BenchmarkRow,
} from './_components/benchmark-editor';
import {
  addProdDetailRow,
  listProdDetail,
  removeProdDetailRow,
  updateProdDetailRow,
} from './_actions/finish-wip';
import {
  deleteBenchmark,
  listBenchmarks,
  upsertBenchmark,
} from './_actions/benchmarks';
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
import { FaBomTab, type FaBomTabLabels } from './_components/fa-bom-tab';
import { FaSectionWrapper, type FaSectionPart } from './_components/fa-section-wrapper';
import { getFaBom } from './_actions/get-fa-bom';
import type { FaBomResult } from './_actions/fa-bom-types';
import { bom_export_csv } from '../../../../../(npd)/fa/actions/bom-export-csv';
import {
  AllergenCascadeSection,
  buildAllergenLabels,
  loadAllergenCascade,
  type AllergenLoad,
} from './_lib/allergen-cascade';
import { FaHeaderActions, type FaHeaderActionsLabels } from './_components/fa-header-actions';
import {
  DeptStatusStrip,
  type DeptStatusItem,
  type DeptStatus,
} from '../../../../../../components/npd/dept-status-strip';
import {
  DEPT_KEYS,
  deriveDeptStatuses,
  type DeptKey,
  type GenericDeptColumn,
} from '../../../../../../lib/npd/derive-dept-statuses';
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
  | {
      state: 'ready';
      fa: FaCoreRow;
      history: HistoryLoad;
      dept: DeptData;
      deptStatuses: Record<DeptKey, DeptStatus>;
      canDelete: boolean;
      canBuild: boolean;
    }
  | { state: 'empty' }
  | { state: 'permission_denied' }
  | { state: 'error' };

const DELETE_PERMISSION = 'npd.core.write';
const BUILD_PERMISSION = 'npd.fa.build';

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
const MONO_KEYS = new Set<string>(['bar_codes', 'dev_code']);

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

// ---------------------------------------------------------------------------
// Dropdown options — load the real, org-scoped option list for every distinct
// `dropdown_source` the loaded DeptColumns reference. The Selects in every dept
// tab read `dropdowns[col.dropdownSource] ?? []`, so without this they render
// empty (the "Pack Size *" stuck-Core bug). Sourced from "Reference".<source>
// inside the SAME org-context tx (RLS pinned via app.current_org_id()) — NO
// hardcoded arrays, NO service-role bypass.
// ---------------------------------------------------------------------------

/** dropdown_source → (Reference table, value column). */
const DROPDOWN_SOURCE_TABLE: Record<string, { table: string; valueColumn: string }> = {
  PackSizes: { table: 'PackSizes', valueColumn: 'value' },
  Templates: { table: 'Templates', valueColumn: 'template_name' },
  Lines_By_PackSize: { table: 'Lines_By_PackSize', valueColumn: 'line' },
  Equipment_Setup_By_Line_Pack: {
    table: 'Equipment_Setup_By_Line_Pack',
    valueColumn: 'equipment_setup',
  },
  CloseConfirm: { table: 'CloseConfirm', valueColumn: 'value' },
  ManufacturingOperations: { table: 'ManufacturingOperations', valueColumn: 'operation_name' },
};

/**
 * For each distinct dropdown_source present in the loaded columns, query the
 * matching "Reference".<table> org-scoped and return a Record keyed by the
 * dropdown_source string. Unknown sources are skipped (no throw) so a future
 * DeptColumns source can't 500 the whole page.
 */
async function readDropdowns(
  ctx: OrgContextLike,
  columns: GenericDeptColumn[][],
): Promise<Record<string, string[]>> {
  const sources = new Set<string>();
  for (const group of columns) {
    for (const col of group) {
      if (col.dropdownSource) sources.add(col.dropdownSource);
    }
  }

  const result: Record<string, string[]> = {};
  for (const source of sources) {
    const mapping = DROPDOWN_SOURCE_TABLE[source];
    if (!mapping) continue;
    // Table + column names are from a fixed allow-list above (never user input),
    // so the identifier interpolation is safe; the org filter is RLS-pinned.
    const { rows } = await ctx.client.query<{ value: string | null }>(
      `select ${mapping.valueColumn} as value
         from "Reference"."${mapping.table}"
        where org_id = app.current_org_id()
        order by ${mapping.valueColumn}`,
    );
    result[source] = rows
      .map((row) => (row.value == null ? '' : String(row.value)))
      .filter((value) => value.trim() !== '');
  }
  return result;
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
  /** A3 SLICE 2: MRP schema-driven columns, rendered inside the Production section. */
  mrp: GenericDeptColumn[];
  prodRows: ProdDetailRow[];
  /** Real, org-scoped dropdown options keyed by dropdown_source. */
  dropdowns: Record<string, string[]>;
  /** Server-resolved npd.production.write — drives the Production add/remove affordances. */
  canWriteProduction: boolean;
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
        canWriteProduction,
        mrp,
        canDelete,
        canBuild,
      ] = await Promise.all([
        readProductValues(ctx, productCode),
        readDeptColumns(ctx, 'Core'),
        readDeptColumns(ctx, 'Planning'),
        readDeptColumns(ctx, 'Commercial'),
        readDeptColumns(ctx, 'Production'),
        readDeptColumns(ctx, 'Technical'),
        readDeptColumns(ctx, 'Procurement'),
        readProdDetailRows(ctx, productCode),
        hasPermission(ctx, 'npd.production.write'),
        readDeptColumns(ctx, 'MRP'),
        hasPermission(ctx, DELETE_PERMISSION),
        hasPermission(ctx, BUILD_PERMISSION),
      ]);

      const coreDone = String(values.closed_core ?? '').toLowerCase() === 'yes';
      const prodDone = String(values.closed_production ?? '').toLowerCase() === 'yes';

      // Real dropdown options for every dropdown_source referenced by the loaded
      // columns — read in the SAME org-context tx (RLS-pinned). Without this the
      // schema-driven Selects (Pack Size *, Template, Line, Equipment, Closed_*)
      // render empty and Core can never be closed.
      const dropdowns = await readDropdowns(ctx, [
        core,
        planning,
        commercial,
        production,
        technical,
        procurement,
        mrp,
      ]);

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
        mrp,
        prodRows,
        dropdowns,
        canWriteProduction,
      };

      // Dept-status strip — derived SERVER-SIDE from the real product row +
      // the live DeptColumns required-field metadata (NO hardcoded array).
      const deptStatuses = deriveDeptStatuses(values, {
        core,
        planning,
        commercial,
        production,
        technical,
        mrp,
        procurement,
      });

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

      return { state: 'ready', fa, history, dept, deptStatuses, canDelete, canBuild };
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
  breadcrumbAriaLabel: string;
  subtitle: string;
  built: string;
  empty: string;
  emptyBody: string;
  forbidden: string;
  error: string;
  status: Record<StatusKey, string>;
  tabs: FaTabsLabels;
  /** Dept-status strip (prototype fa-screens.jsx:365-385). */
  deptStrip: {
    ariaLabel: string;
    labels: Record<DeptKey, string>;
    statusLabels: Record<DeptStatus, string>;
  };
  /**
   * A3 SLICE 2 — per-dept "Close {dept}" affordance label (FaSectionWrapper).
   * `{dept}` is replaced with the localized dept heading. This is the launcher
   * for the dept-close modal; post-regroup it carries an EXPLICIT ?dept= so the
   * gate no longer depends on ?tab= inference.
   */
  closeDept: string;
  /** Header actions bar (prototype fa-screens.jsx:344-362). */
  actions: FaHeaderActionsLabels;
  /** Workflow template line (product-owner approved addition). */
  workflow: {
    /** "Workflow template: {template} — {type} · {count} departments". */
    line: string;
    fallbackTemplate: string;
    fallbackType: string;
    multiComponentType: string;
    singleComponentType: string;
  };
};

const DEFAULT_FA_DETAIL_LABELS: FaDetailLabels = {
  eyebrow: 'Finished Good',
  breadcrumbAriaLabel: 'Breadcrumb',
  subtitle: 'Department workspace · close each department to complete the FG',
  built: 'Built',
  empty: 'Finished Good not found',
  emptyBody: 'No Finished Good matches this code in your organisation.',
  forbidden: 'You do not have permission to view this Finished Good.',
  error: 'Unable to load this Finished Good.',
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
      commercial: 'Commercial & Planning',
      production: 'Production & Technical',
      bom: 'BOM',
      history: 'History',
    },
    deferred: 'Tab content deferred',
    deferredBody: 'This department workspace is delivered in a later slice.',
    locked: 'Locked',
  },
  deptStrip: {
    ariaLabel: 'Department gate progress',
    labels: {
      core: 'Core',
      planning: 'Planning',
      commercial: 'Commercial',
      production: 'Production',
      technical: 'Technical',
      mrp: 'MRP',
      procurement: 'Procurement',
    },
    statusLabels: {
      done: 'Done',
      inprog: 'In progress',
      blocked: 'Blocked',
      pending: 'Pending',
    },
  },
  closeDept: 'Close {dept}',
  actions: {
    deleteFa: 'Delete FG',
    d365Build: 'Build D365 →',
    deleteDisabledHint: 'You do not have permission to delete finished goods.',
    d365DisabledHint: 'FG must be Complete first (all 7 departments closed).',
  },
  workflow: {
    line: 'Workflow template: {template} — {type} · {count} departments',
    fallbackTemplate: 'Standard NPD',
    fallbackType: 'Single component',
    multiComponentType: 'Multi component',
    singleComponentType: 'Single component',
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
      breadcrumbAriaLabel: pick('breadcrumbAriaLabel', d.breadcrumbAriaLabel),
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
        tablistLabel: pick('tabs.tablistLabel', d.tabs.tablistLabel),
        tabs: {
          // A3 SLICE 2 — 3 SECTION labels + the unchanged BOM / History tabs. The
          // section labels use new keys (tabs.sectionCore/sectionCommercial/
          // sectionProduction) so the old per-dept tab keys stay untouched.
          core: pick('tabs.sectionCore', d.tabs.tabs.core),
          commercial: pick('tabs.sectionCommercial', d.tabs.tabs.commercial),
          production: pick('tabs.sectionProduction', d.tabs.tabs.production),
          bom: pick('tabs.bom', d.tabs.tabs.bom),
          history: pick('tabs.history', d.tabs.tabs.history),
        },
        deferred: pick('deferred', d.tabs.deferred),
        deferredBody: pick('deferredBody', d.tabs.deferredBody),
        locked: pick('tabs.locked', d.tabs.locked ?? 'Locked'),
      },
      deptStrip: {
        ariaLabel: pick('deptStrip.ariaLabel', d.deptStrip.ariaLabel),
        labels: {
          core: pick('deptStrip.labels.core', d.deptStrip.labels.core),
          planning: pick('deptStrip.labels.planning', d.deptStrip.labels.planning),
          commercial: pick('deptStrip.labels.commercial', d.deptStrip.labels.commercial),
          production: pick('deptStrip.labels.production', d.deptStrip.labels.production),
          technical: pick('deptStrip.labels.technical', d.deptStrip.labels.technical),
          mrp: pick('deptStrip.labels.mrp', d.deptStrip.labels.mrp),
          procurement: pick('deptStrip.labels.procurement', d.deptStrip.labels.procurement),
        },
        statusLabels: {
          done: pick('deptStrip.statusLabels.done', d.deptStrip.statusLabels.done),
          inprog: pick('deptStrip.statusLabels.inprog', d.deptStrip.statusLabels.inprog),
          blocked: pick('deptStrip.statusLabels.blocked', d.deptStrip.statusLabels.blocked),
          pending: pick('deptStrip.statusLabels.pending', d.deptStrip.statusLabels.pending),
        },
      },
      closeDept: pick('closeDept', d.closeDept),
      actions: {
        deleteFa: pick('actions.deleteFa', d.actions.deleteFa),
        d365Build: pick('actions.d365Build', d.actions.d365Build),
        deleteDisabledHint: pick('actions.deleteDisabledHint', d.actions.deleteDisabledHint),
        d365DisabledHint: pick('actions.d365DisabledHint', d.actions.d365DisabledHint),
      },
      workflow: {
        line: pick('workflow.line', d.workflow.line),
        fallbackTemplate: pick('workflow.fallbackTemplate', d.workflow.fallbackTemplate),
        fallbackType: pick('workflow.fallbackType', d.workflow.fallbackType),
        multiComponentType: pick('workflow.multiComponentType', d.workflow.multiComponentType),
        singleComponentType: pick('workflow.singleComponentType', d.workflow.singleComponentType),
      },
    };
  } catch {
    return DEFAULT_FA_DETAIL_LABELS;
  }
}

// History tab labels (npd.faHistory) — unchanged contract from T-027.
const DEFAULT_HISTORY_LABELS: FaHistoryLabels = {
  title: 'History',
  subtitle: 'Read-only timeline of every change to this Finished Good.',
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
  emptyBody: 'Changes to this Finished Good will appear here as they happen.',
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
        // next-intl (no custom getMessageFallback) returns the FULL namespaced
        // path for a missing message — e.g. `npd.faProductionTab.emptyCtaBody` —
        // NOT the bare key. A bare `value === key` guard therefore lets that raw
        // path leak onto the screen (the live "emptyCtaBody key shows" bug). Treat
        // both the bare key AND the fully-qualified `${namespace}.${key}` path as a
        // miss, so a future un-seeded key always falls back to the English string.
        if (value === key || value === `${namespace}.${key}`) return fallback;
        return value;
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

async function buildFinishWipLabels(locale: string): Promise<FinishWipEditorLabels> {
  const p = await pickerFor(locale, 'npd.finishWip');
  return {
    title: p('title', 'Finish WIP (production components)'),
    subtitle: p('subtitle', 'Per-component production rows backed by ProdDetail'),
    multiBadge: p('multiBadge', 'Multi component'),
    singleBadge: p('singleBadge', 'Single component'),
    componentHeader: p('componentHeader', 'Component'),
    autoCodeHeader: p('autoCodeHeader', 'RM / ingredient code (auto)'),
    weightHeader: p('weightHeader', 'Weight (g)'),
    actionsHeader: p('actionsHeader', 'Actions'),
    autoHint: p('autoHint', 'Auto-derived from the component code'),
    addRow: p('addRow', 'Add component'),
    removeRow: p('removeRow', 'Remove'),
    componentPlaceholder: p('componentPlaceholder', 'e.g. PR8801'),
    singleLockedHint: p(
      'singleLockedHint',
      'Single-component product — one row mirrors the main table.',
    ),
    loading: p('loading', 'Loading components…'),
    empty: p('empty', 'No components yet'),
    emptyBody: p('emptyBody', 'Add the first finish-WIP component.'),
    error: p('error', 'Could not load components.'),
    forbidden: p('forbidden', 'You do not have permission to view production components.'),
    saving: p('saving', 'Saving…'),
    saveError: p('saveError', 'Could not save the component.'),
  };
}

async function buildBenchmarkLabels(locale: string): Promise<BenchmarkEditorLabels> {
  const p = await pickerFor(locale, 'npd.benchmarks');
  return {
    title: p('title', 'Benchmarks'),
    subtitle: p('subtitle', 'Competitor reference prices'),
    countBadge: p('countBadge', '{n} benchmarks'),
    labelHeader: p('labelHeader', 'Benchmark'),
    priceHeader: p('priceHeader', 'Price'),
    labelPlaceholder: p('labelPlaceholder', 'e.g. Tesco Finest'),
    pricePlaceholder: p('pricePlaceholder', '0.00'),
    add: p('add', 'Add benchmark'),
    save: p('save', 'Save'),
    saving: p('saving', 'Saving…'),
    remove: p('remove', 'Remove'),
    saved: p('saved', 'Saved'),
    saveError: p('saveError', 'Could not save the benchmark'),
    loading: p('loading', 'Loading benchmarks…'),
    empty: p('empty', 'No benchmarks yet'),
    emptyBody: p('emptyBody', 'Add a competitor benchmark price.'),
    error: p('error', 'Something went wrong loading benchmarks'),
    forbidden: p('forbidden', 'You do not have permission to view benchmarks'),
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
    addComponent: p('addComponent', '+ Add production component'),
    emptyCtaBody: p(
      'emptyCtaBody',
      'Add a production component from the items master, or edit the Core recipe.',
    ),
    removeComponent: p('removeComponent', 'Remove component'),
    removeError: p('removeError', 'Could not remove the component'),
    picker: {
      trigger: p('addComponent', '+ Add production component'),
      searchLabel: p('picker.searchLabel', 'Search items'),
      searchPlaceholder: p('picker.searchPlaceholder', 'Search by code or name…'),
      loading: p('picker.loading', 'Searching…'),
      empty: p('picker.empty', 'No matching items'),
      cancel: p('picker.cancel', 'Cancel'),
      error: p('picker.error', 'Item search failed'),
    },
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

/**
 * A3 SLICE 2 — MRP labels. There is no dedicated FaMrpTab component; the MRP
 * fields are rendered inside the Production section by REUSING FaProcurementTab
 * (the simplest schema-driven dept body: columns/values/dropdowns → editable
 * cells → updateFaCell). FaProcurementTab's price-gate is inert for MRP (no MRP
 * column carries `priceGated`), so we pass closedCore/closedProduction='Yes' to
 * keep the procurement-specific amber alert hidden. These labels therefore reuse
 * the FaProcurementTabLabels shape but carry MRP-appropriate copy from the
 * npd.faMrpTab namespace.
 */
async function buildMrpLabels(
  locale: string,
  columns: GenericDeptColumn[],
): Promise<FaProcurementTabLabels> {
  const p = await pickerFor(locale, 'npd.faMrpTab');
  return {
    title: p('title', 'MRP'),
    subtitle: p('subtitle', 'Material requirements planning details'),
    closedBadge: p('closedBadge', 'Closed'),
    openBadge: p('openBadge', 'Open'),
    // Inert for MRP (no priceGated column) — kept to satisfy the shared label shape.
    priceBlockedTitle: p('priceBlockedTitle', 'Locked'),
    priceBlockedBody: p('priceBlockedBody', 'Field locked.'),
    priceBlockedHint: p('priceBlockedHint', 'Locked.'),
    save: p('save', 'Save MRP'),
    saving: p('saving', 'Saving…'),
    saveSuccess: p('saveSuccess', 'Saved'),
    saveError: p('saveError', 'Save failed'),
    selectPlaceholder: p('selectPlaceholder', 'Select…'),
    loading: p('loading', 'Loading…'),
    empty: p('empty', 'No MRP columns configured'),
    emptyBody: p('emptyBody', 'Configure MRP columns in Settings.'),
    error: p('error', 'Unable to load MRP.'),
    forbidden: p('forbidden', 'You cannot edit MRP.'),
    fields: fieldLabelsFor(columns, p),
  };
}

async function buildBomLabels(locale: string): Promise<FaBomTabLabels> {
  const p = await pickerFor(locale, 'npd.faBomTab');
  return {
    title: p('title', 'BOM (computed view)'),
    readOnlyNote: p(
      'readOnlyNote',
      'Read-only view of the shared BOM. Bills of materials are edited in Technical.',
    ),
    exportCsv: p('exportCsv', 'Export BOM CSV'),
    exporting: p('exporting', 'Exporting…'),
    exportError: p('exportError', 'Could not export the BOM CSV.'),
    versionLine: p('versionLine', 'v{version} · {status} · {count} lines'),
    statusLabels: {
      draft: p('status.draft', 'Draft'),
      in_review: p('status.in_review', 'In review'),
      technical_approved: p('status.technical_approved', 'Technical approved'),
      active: p('status.active', 'Active'),
    },
    colType: p('colType', 'Type'),
    colCode: p('colCode', 'Code'),
    colName: p('colName', 'Name'),
    colQty: p('colQty', 'Qty'),
    colStage: p('colStage', 'Stage'),
    colSource: p('colSource', 'Source'),
    colD365: p('colD365', 'D365 status'),
    d365Found: p('d365Found', 'Found'),
    d365NoCost: p('d365NoCost', 'No cost'),
    d365Missing: p('d365Missing', 'Missing'),
    d365Empty: p('d365Empty', 'Not in D365'),
    loading: p('loading', 'Loading BOM…'),
    error: p('error', 'Unable to load the BOM.'),
    forbidden: p('forbidden', 'You do not have permission to view this BOM.'),
    empty: p('empty', 'No BOM yet'),
    emptyBody: p('emptyBody', 'This Finished Good has no bill of materials.'),
    technicalLink: p('technicalLink', 'Open in Technical'),
  };
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function statusBadge(statusOverall: string | null, labels: FaDetailLabels) {
  if (!statusOverall) return null;
  const isKnown = (STATUS_KEYS as readonly string[]).includes(statusOverall);
  const label = isKnown ? labels.status[statusOverall as StatusKey] : statusOverall;
  // Design-system `.badge-<tone>` (globals.css) — the @monopilot/ui Badge primitive
  // only emits the unstyled `.badge--<variant>`, hence the class passthrough.
  const cls =
    statusOverall === 'Complete' || statusOverall === 'Built'
      ? 'badge-green'
      : statusOverall === 'Alert'
        ? 'badge-red'
        : statusOverall === 'InProgress'
          ? 'badge-amber'
          : 'badge-gray';
  return (
    <span className={`badge ${cls}`} data-testid="fa-detail-status">
      {label}
    </span>
  );
}

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <main className="flex w-full flex-col gap-4 px-6 py-6">
      <div role="alert" data-testid={testId} className="card" style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 15, fontWeight: 600 }}>{title}</p>
        {body ? <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>{body}</p> : null}
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
    mrp: [],
    prodRows: [],
    dropdowns: {},
    canWriteProduction: false,
  };

  const emptyDeptStatuses: Record<DeptKey, DeptStatus> = {
    core: 'pending',
    planning: 'pending',
    commercial: 'pending',
    production: 'pending',
    technical: 'pending',
    mrp: 'pending',
    procurement: 'pending',
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
        deptStatuses: emptyDeptStatuses,
        canDelete: false,
        canBuild: false,
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

  const { fa, history, dept, deptStatuses, canDelete, canBuild } = load;

  // Dept-status strip items: localized labels merged with server-derived statuses
  // (status derivation is in loadFaDetail → deriveDeptStatuses; NO hardcode here).
  const deptStripItems: DeptStatusItem[] = DEPT_KEYS.map((deptKey, i) => ({
    dept: deptKey,
    label: labels.deptStrip.labels[deptKey],
    status: deptStatuses[deptKey],
    index: i + 1,
  }));

  const faComplete = fa.statusOverall === 'Complete' || fa.statusOverall === 'Built';

  // Workflow template line (product-owner approved addition). Source the template
  // / type from the real product row when present; otherwise fall back to a
  // sensible label. The "· 7 departments" suffix is ALWAYS shown.
  const templateValue = String(dept.values.template ?? '').trim();
  const workflowTemplate = templateValue !== '' ? templateValue : labels.workflow.fallbackTemplate;
  const recipeComponents = String(dept.values.recipe_components ?? '').trim();
  const componentCount = recipeComponents
    ? recipeComponents.split(',').filter((s) => s.trim() !== '').length
    : 0;
  const workflowType =
    componentCount > 1
      ? labels.workflow.multiComponentType
      : componentCount === 1
        ? labels.workflow.singleComponentType
        : labels.workflow.fallbackType;
  const workflowLine = labels.workflow.line
    .replace('{template}', workflowTemplate)
    .replace('{type}', workflowType)
    .replace('{count}', '7');

  // Dept tab labels (English fallback via next-intl pick) + earliest launch date
  // (V08) computed server-side from the product's brief handoff.
  const [
    coreLabels,
    planningLabels,
    commercialLabels,
    productionLabels,
    technicalLabels,
    procurementLabels,
    mrpLabels,
    allergenLabels,
    finishWipLabels,
    benchmarkLabels,
    bomLabels,
  ] = await Promise.all([
    buildCoreLabels(locale, dept.core),
    buildPlanningLabels(locale, dept.planning),
    buildCommercialLabels(locale, dept.commercial),
    buildProductionLabels(locale, dept.production),
    buildTechnicalLabels(locale, dept.technical),
    buildProcurementLabels(locale, dept.procurement),
    buildMrpLabels(locale, dept.mrp),
    buildAllergenLabels(locale),
    buildFinishWipLabels(locale),
    buildBenchmarkLabels(locale),
    buildBomLabels(locale),
  ]);

  // Read-only FA BOM (computed view, SCR-03h) — REAL, org-scoped via getFaBom
  // (own withOrgContext + RLS + server-resolved npd.fa.read). Skipped on the
  // injected (test-only) path, which renders the empty BOM state instead.
  const bomLoad: FaBomResult = injected ? { state: 'empty' } : await getFaBom(fa.productCode);
  const bomSlot = (
    <FaBomTab
      productCode={fa.productCode}
      version={bomLoad.state === 'ready' ? bomLoad.version : null}
      lines={bomLoad.state === 'ready' ? bomLoad.lines : []}
      labels={bomLabels}
      state={bomLoad.state === 'ready' ? 'ready' : 'empty'}
      onExportCsv={injected ? undefined : bom_export_csv}
    />
  );

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

  // Finish-WIP (prod_detail) + Benchmark editors — mounted into the Core tab.
  // isMultiComponent reuses the workflow-line vars above (template starts with
  // "multi" OR more than one recipe component). Both row loads are REAL Supabase
  // reads, skipped on the injected (test) path so the existing page tests stay
  // DB-free; on that path the slots are omitted entirely.
  const isMultiComponent = templateValue.toLowerCase().startsWith('multi') || componentCount > 1;
  const finishWipRows = injected ? [] : (await listProdDetail({ productCode: fa.productCode })).rows;
  const benchmarkRows: BenchmarkRow[] = injected
    ? []
    : (await listBenchmarks({ productCode: fa.productCode })).map((b) => ({
        id: b.id,
        label: b.label,
        price: b.price,
        displayOrder: b.displayOrder,
      }));

  const finishWipSlot = injected ? undefined : (
    <FinishWipEditor
      productCode={fa.productCode}
      rows={finishWipRows}
      isMultiComponent={isMultiComponent}
      labels={finishWipLabels}
      state="ready"
      onAddRow={addProdDetailRow}
      onRemoveRow={removeProdDetailRow}
      onUpdateRow={updateProdDetailRow}
    />
  );
  const benchmarkSlot = injected ? undefined : (
    <BenchmarkEditor
      productCode={fa.productCode}
      initialRows={benchmarkRows}
      labels={benchmarkLabels}
      state="ready"
      onUpsert={upsertBenchmark}
      onDelete={deleteBenchmark}
    />
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

  // A3 SLICE 2 — assemble each dept body ONCE (the FaXxxTab components themselves
  // get ZERO changes), then GROUP them into 3 owner-facing sections via
  // FaSectionWrapper. The dept→section grouping mirrors SECTION_MAP in
  // load-fa-dynamic-sections.types.ts:
  //   core       = [Core]
  //   commercial = [Commercial, Planning, Procurement]
  //   production = [Production, Technical, MRP]
  // bom + history keep their OWN tabs (unchanged), so the tab bar is 5 tabs.
  const coreNode = (
    <FaCoreTab
      productCode={fa.productCode}
      columns={dept.core as FaCoreColumn[]}
      values={dept.values}
      dropdowns={dept.dropdowns}
      labels={coreLabels}
      state="ready"
      finishWipSlot={finishWipSlot}
      benchmarkSlot={benchmarkSlot}
    />
  );
  const planningNode = (
    <FaPlanningTab
      productCode={fa.productCode}
      columns={dept.planning as FaPlanningColumn[]}
      values={dept.values}
      dropdowns={dept.dropdowns}
      labels={planningLabels}
      state="ready"
    />
  );
  const commercialNode = (
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
  );
  const productionNode = (
    <FaProductionTab
      productCode={fa.productCode}
      packSizeFilled={packSizeFilled}
      columns={dept.production as FaProductionColumn[]}
      rows={dept.prodRows}
      dropdowns={dept.dropdowns}
      labels={productionLabels}
      canWrite={dept.canWriteProduction}
      state="ready"
    />
  );
  const technicalNode = (
    <FaTechnicalTab
      productCode={fa.productCode}
      columns={dept.technical as FaTechnicalColumn[]}
      values={dept.values}
      dropdowns={dept.dropdowns}
      labels={technicalLabels}
      state="ready"
      allergenSlot={allergenSlot}
    />
  );
  const procurementNode = (
    <FaProcurementTab
      productCode={fa.productCode}
      columns={dept.procurement as FaProcurementColumn[]}
      values={dept.values}
      dropdowns={dept.dropdowns}
      closedCore={closedCore}
      closedProduction={closedProduction}
      labels={procurementLabels}
      state="ready"
    />
  );
  // MRP body: REUSE FaProcurementTab as the schema-driven field renderer fed by
  // the MRP DeptColumns (loaded above) + the real product values. The price-gate
  // is inert (no MRP column is priceGated), so closedCore/closedProduction='Yes'
  // simply keeps the procurement amber alert hidden. Writes go through the SAME
  // updateFaCell action (DEPT_PERMISSION maps mrp → npd.mrp.write). NO field-cell
  // rewrite — this is the same component the Procurement dept uses.
  const mrpNode = (
    <FaProcurementTab
      productCode={fa.productCode}
      columns={dept.mrp as FaProcurementColumn[]}
      values={dept.values}
      dropdowns={dept.dropdowns}
      closedCore="Yes"
      closedProduction="Yes"
      labels={mrpLabels}
      state="ready"
    />
  );

  // `deptValue` is the EXACT canonical `Dept` union string the modal host's
  // ?dept= param + close/readiness actions expect (Core/Commercial/Planning/
  // Procurement/Production/Technical/MRP). It is supplied explicitly per part so
  // the dept-close affordance never depends on ?tab= inference (post-A3-slice-2
  // the tab slugs are section slugs — inference would pick the wrong dept).
  const commercialParts: FaSectionPart[] = [
    { key: 'commercial', deptValue: 'Commercial', heading: labels.deptStrip.labels.commercial, node: commercialNode },
    { key: 'planning', deptValue: 'Planning', heading: labels.deptStrip.labels.planning, node: planningNode },
    { key: 'procurement', deptValue: 'Procurement', heading: labels.deptStrip.labels.procurement, node: procurementNode },
  ];
  const productionParts: FaSectionPart[] = [
    { key: 'production', deptValue: 'Production', heading: labels.deptStrip.labels.production, node: productionNode },
    { key: 'technical', deptValue: 'Technical', heading: labels.deptStrip.labels.technical, node: technicalNode },
    { key: 'mrp', deptValue: 'MRP', heading: labels.deptStrip.labels.mrp, node: mrpNode },
  ];

  const panels: FaTabPanels = {
    core: (
      <FaSectionWrapper
        sectionKey="core"
        closeDeptLabel={labels.closeDept}
        parts={[{ key: 'core', deptValue: 'Core', heading: labels.deptStrip.labels.core, node: coreNode }]}
      />
    ),
    commercial: <FaSectionWrapper sectionKey="commercial" closeDeptLabel={labels.closeDept} parts={commercialParts} />,
    production: <FaSectionWrapper sectionKey="production" closeDeptLabel={labels.closeDept} parts={productionParts} />,
    bom: bomSlot,
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
    <main className="flex w-full flex-col gap-3">
      {/* sticky-form-header — FG detail is very long (prototype lines 354-387) */}
      {/* NOTE: this header is intentionally NOT sticky. The shared
          `.sticky-form-header` class pins at top:var(--topbar-h) with z-10; because
          the header is tall (~133px) it pinned over the 7-dept strip + tab bar on
          scroll, hiding them (live Gate-5 finding). `position:static` keeps every
          row in normal flow so nothing is covered. Horizontal padding (16px, matching
          `.card`) stops header content sticking to the content-column edge. */}
      <section
        aria-label={labels.eyebrow}
        className="sticky-form-header"
        style={{ padding: '10px 16px', marginBottom: 4, position: 'static' }}
      >
        <nav aria-label={labels.breadcrumbAriaLabel} className="breadcrumb">
          NPD / <span>{labels.eyebrow}</span>
        </nav>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>
                {fa.productCode}
              </span>
              <h1 style={{ fontSize: 18, fontWeight: 600 }}>{fa.productName ?? fa.productCode}</h1>
              {statusBadge(fa.statusOverall, labels)}
              {fa.built ? (
                <span className="badge badge-blue" data-testid="fa-detail-built">
                  ⚡ {labels.built}
                </span>
              ) : null}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{labels.subtitle}</p>
            {/* Workflow template line (product-owner approved; not in prototype) */}
            <p
              className="muted"
              style={{ fontSize: 12, marginTop: 2 }}
              data-testid="fa-detail-workflow-line"
            >
              {workflowLine}
            </p>
          </div>

          {/* ACTIONS BAR (prototype fa-screens.jsx:344-362) */}
          <FaHeaderActions
            canDelete={canDelete}
            canBuild={canBuild}
            faComplete={faComplete}
            labels={labels.actions}
          />
        </div>
      </section>

      {/* 7-DEPT STATUS STRIP (prototype fa-screens.jsx:365-385) */}
      <DeptStatusStrip
        items={deptStripItems}
        ariaLabel={labels.deptStrip.ariaLabel}
        statusLabels={labels.deptStrip.statusLabels}
      />

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
