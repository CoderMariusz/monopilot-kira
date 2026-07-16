/**
 * Trace & Recall (Wave E2A) — label builders.
 *
 * Resolves the LIVE next-intl `quality.trace` / `quality.recallDrills`
 * namespaces (apps/web/i18n/{en,pl,ro,uk}.json — real en + pl, ro/uk mirror EN
 * per the locale lesson) into the typed label objects the client islands
 * consume. Lesson F-D08a: keys live in the live catalogs, NOT a staging bundle.
 *
 * A `Translator` is any `(key, values?) => string` — both next-intl's
 * `getTranslations('quality.trace')` (RSC) and a vi.fn-backed test translator
 * satisfy it, so the RSC pages and the RTL tests assert the same resolved
 * strings.
 */
import type { TraceNodeType, TraceInputType, TraceDirection } from './trace-contracts';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export const INPUT_TYPES: TraceInputType[] = ['lp', 'batch', 'item'];
export const DIRECTIONS: TraceDirection[] = ['backward', 'forward', 'both'];
export const NODE_TYPES: TraceNodeType[] = [
  'supplier',
  'purchase_order',
  'grn',
  'input_lp',
  'work_order',
  'output_lp',
  'shipment_placeholder',
];

export type TraceLabels = {
  /** the input row */
  form: {
    legend: string;
    refLabel: string;
    refPlaceholder: string;
    typeLabel: string;
    typePlaceholder: string;
    directionLabel: string;
    run: string;
    running: string;
  };
  inputType: Record<TraceInputType, string>;
  direction: Record<TraceDirection, string>;
  nodeType: Record<TraceNodeType, string>;
  summary: {
    title: string;
    lpCount: string;
    woCount: string;
    shipmentCount: string;
    customersAffected: string;
    totalKg: string;
  };
  graph: {
    title: string;
    ariaLabel: string;
    open: string;
    qty: string;
    via: string;
    noLink: string;
  };
  table: {
    title: string;
    ariaLabel: string;
    ref: string;
    type: string;
    qty: string;
  };
  states: {
    loading: string;
    emptyTitle: string;
    emptyBody: string;
    emptyCta: string;
    errorTitle: string;
    errorBody: string;
    deniedTitle: string;
    deniedBody: string;
  };
  truncation: {
    banner: string;
    layerSeedLp: string;
    layerSeedBatch: string;
    layerSeedItem: string;
  };
  massBalance: {
    title: string;
    ariaLabel: string;
    nodeTitle: string;
    nodeWo: string;
    nodeInput: string;
    nodeOutput: string;
    nodeWaste: string;
    nodeRemaining: string;
    nodeDelta: string;
    totalTitle: string;
    seedInput: string;
    onSite: string;
    shipped: string;
    waste: string;
    nettedDelta: string;
    percentAccounted: string;
    nettedUnbalanced: string;
    unreconciledTitle: string;
    unreconciledRow: string;
    scopeLimited: string;
  };
};

export type RecallDrillsLabels = {
  title: string;
  subtitle: string;
  breadcrumb: { quality: string; recallDrills: string };
  newDrill: string;
  targetBadge: string;
  withinTarget: string;
  overTarget: string;
  inProgress: string;
  col: {
    ref: string;
    type: string;
    direction: string;
    started: string;
    duration: string;
    status: string;
  };
  inputType: Record<TraceInputType, string>;
  direction: Record<TraceDirection, string>;
  states: {
    loading: string;
    emptyTitle: string;
    emptyBody: string;
    emptyCta: string;
    errorTitle: string;
    errorBody: string;
    deniedTitle: string;
    deniedBody: string;
  };
  detail: {
    backToList: string;
    notFoundTitle: string;
    notFoundBody: string;
    summaryTitle: string;
    reportTitle: string;
    startedAt: string;
    completedAt: string;
    duration: string;
    rerun: string;
  };
  duration: {
    pending: string;
    hm: string;
    ms: string;
    s: string;
  };
};

function interpolateTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) =>
    values[k] !== undefined ? String(values[k]) : `{${k}}`,
  );
}

export function buildTraceLabels(t: Translator): TraceLabels {
  return {
    form: {
      legend: t('form.legend'),
      refLabel: t('form.refLabel'),
      refPlaceholder: t('form.refPlaceholder'),
      typeLabel: t('form.typeLabel'),
      typePlaceholder: t('form.typePlaceholder'),
      directionLabel: t('form.directionLabel'),
      run: t('form.run'),
      running: t('form.running'),
    },
    inputType: Object.fromEntries(
      INPUT_TYPES.map((k) => [k, t(`inputType.${k}`)]),
    ) as Record<TraceInputType, string>,
    direction: Object.fromEntries(
      DIRECTIONS.map((k) => [k, t(`direction.${k}`)]),
    ) as Record<TraceDirection, string>,
    nodeType: Object.fromEntries(
      NODE_TYPES.map((k) => [k, t(`nodeType.${k}`)]),
    ) as Record<TraceNodeType, string>,
    summary: {
      title: t('summary.title'),
      lpCount: t('summary.lpCount'),
      woCount: t('summary.woCount'),
      shipmentCount: t('summary.shipmentCount'),
      customersAffected: t('summary.customersAffected'),
      totalKg: t('summary.totalKg'),
    },
    graph: {
      title: t('graph.title'),
      ariaLabel: t('graph.ariaLabel'),
      open: t('graph.open'),
      qty: t('graph.qty'),
      via: t('graph.via'),
      noLink: t('graph.noLink'),
    },
    table: {
      title: t('table.title'),
      ariaLabel: t('table.ariaLabel'),
      ref: t('table.ref'),
      type: t('table.type'),
      qty: t('table.qty'),
    },
    states: {
      loading: t('states.loading'),
      emptyTitle: t('states.emptyTitle'),
      emptyBody: t('states.emptyBody'),
      emptyCta: t('states.emptyCta'),
      errorTitle: t('states.errorTitle'),
      errorBody: t('states.errorBody'),
      deniedTitle: t('states.deniedTitle'),
      deniedBody: t('states.deniedBody'),
    },
    truncation: {
      banner: t('truncation.banner'),
      layerSeedLp: t('truncation.layerSeedLp'),
      layerSeedBatch: t('truncation.layerSeedBatch'),
      layerSeedItem: t('truncation.layerSeedItem'),
    },
    massBalance: {
      title: t('massBalance.title'),
      ariaLabel: t('massBalance.ariaLabel'),
      nodeTitle: t('massBalance.nodeTitle'),
      nodeWo: t('massBalance.nodeWo'),
      nodeInput: t('massBalance.nodeInput'),
      nodeOutput: t('massBalance.nodeOutput'),
      nodeWaste: t('massBalance.nodeWaste'),
      nodeRemaining: t('massBalance.nodeRemaining'),
      nodeDelta: t('massBalance.nodeDelta'),
      totalTitle: t('massBalance.totalTitle'),
      seedInput: t('massBalance.seedInput'),
      onSite: t('massBalance.onSite'),
      shipped: t('massBalance.shipped'),
      waste: t('massBalance.waste'),
      nettedDelta: t('massBalance.nettedDelta'),
      percentAccounted: t('massBalance.percentAccounted'),
      nettedUnbalanced: t('massBalance.nettedUnbalanced'),
      unreconciledTitle: t('massBalance.unreconciledTitle'),
      unreconciledRow: t('massBalance.unreconciledRow'),
      scopeLimited: t('massBalance.scopeLimited'),
    },
  };
}

export function buildRecallDrillsLabels(t: Translator): RecallDrillsLabels {
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    breadcrumb: {
      quality: t('breadcrumb.quality'),
      recallDrills: t('breadcrumb.recallDrills'),
    },
    newDrill: t('newDrill'),
    targetBadge: t('targetBadge'),
    withinTarget: t('withinTarget'),
    overTarget: t('overTarget'),
    inProgress: t('inProgress'),
    col: {
      ref: t('col.ref'),
      type: t('col.type'),
      direction: t('col.direction'),
      started: t('col.started'),
      duration: t('col.duration'),
      status: t('col.status'),
    },
    inputType: Object.fromEntries(
      INPUT_TYPES.map((k) => [k, t(`inputType.${k}`)]),
    ) as Record<TraceInputType, string>,
    direction: Object.fromEntries(
      DIRECTIONS.map((k) => [k, t(`direction.${k}`)]),
    ) as Record<TraceDirection, string>,
    states: {
      loading: t('states.loading'),
      emptyTitle: t('states.emptyTitle'),
      emptyBody: t('states.emptyBody'),
      emptyCta: t('states.emptyCta'),
      errorTitle: t('states.errorTitle'),
      errorBody: t('states.errorBody'),
      deniedTitle: t('states.deniedTitle'),
      deniedBody: t('states.deniedBody'),
    },
    detail: {
      backToList: t('detail.backToList'),
      notFoundTitle: t('detail.notFoundTitle'),
      notFoundBody: t('detail.notFoundBody'),
      summaryTitle: t('detail.summaryTitle'),
      reportTitle: t('detail.reportTitle'),
      startedAt: t('detail.startedAt'),
      completedAt: t('detail.completedAt'),
      duration: t('detail.duration'),
      rerun: t('detail.rerun'),
    },
    duration: {
      pending: t('durationPending'),
      hm: t('durationHm'),
      ms: t('durationMs'),
      s: t('durationS'),
    },
  };
}

/** 4h recall-drill target in milliseconds (KPI badge threshold). */
export const RECALL_TARGET_MS = 4 * 60 * 60 * 1000;

/**
 * Formats a duration (ms) as "Xh Ym" / "Ym Zs" for the drill KPI. Pure — no
 * i18n side effects beyond the passed translator for the unit suffixes.
 */
export function formatDuration(t: Translator, ms: number | null): string {
  return formatDurationFromLabels(
    {
      pending: t('durationPending'),
      hm: t('durationHm'),
      ms: t('durationMs'),
      s: t('durationS'),
    },
    ms,
  );
}

/** Formats a drill KPI duration from pre-resolved label templates (RSC-safe). */
export function formatDurationFromLabels(
  labels: RecallDrillsLabels['duration'],
  ms: number | null,
): string {
  if (ms === null || ms < 0) return labels.pending;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return interpolateTemplate(labels.hm, { h: hours, m: minutes });
  if (minutes > 0) return interpolateTemplate(labels.ms, { m: minutes, s: seconds });
  return interpolateTemplate(labels.s, { s: seconds });
}

/**
 * Builds the deep-link href for a trace node where a detail route exists.
 * Pure + locale-scoped. Node ids look like `lp:<uuid>`, `grn:<uuid>`,
 * `wo:<uuid>`; the UUID part is used ONLY to construct the href (never
 * rendered). Supplier / PO / shipment placeholders have no detail route → null.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toDetailHref(
  locale: string,
  type: TraceNodeType,
  nodeId: string,
): string | null {
  const idx = nodeId.indexOf(':');
  if (idx === -1) return null;
  const id = nodeId.slice(idx + 1);
  if (!UUID_RE.test(id)) return null;
  switch (type) {
    case 'input_lp':
    case 'output_lp':
      return `/${locale}/warehouse/license-plates/${id}`;
    case 'grn':
      return `/${locale}/warehouse/grns/${id}`;
    case 'work_order':
      return `/${locale}/production/wos/${id}`;
    default:
      return null;
  }
}
