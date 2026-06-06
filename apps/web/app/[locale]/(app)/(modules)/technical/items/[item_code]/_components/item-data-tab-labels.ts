/**
 * Lane A1 — Item Detail · deferred-tab label bundles.
 *
 * Pre-localizes the BOM / Cost / Routing / Lab / D365 / Supplier-specs tab labels
 * via next-intl (`technical.items.detail.dataTabs` namespace) with an English
 * fallback so the server tab bodies stay presentational. Mirrors the
 * allergen-labels.ts `translate` pattern.
 */

import { getTranslations } from 'next-intl/server';

import type {
  BomTabLabels,
  CostTabLabels,
  RoutingTabLabels,
  LabTabLabels,
  D365TabLabels,
  SupplierTabLabels,
} from './item-data-tabs';

export type DataTabLabels = {
  bom: BomTabLabels;
  cost: CostTabLabels;
  routing: RoutingTabLabels;
  lab: LabTabLabels;
  d365: D365TabLabels;
  supplier: SupplierTabLabels;
};

const DEFAULTS: DataTabLabels = {
  bom: {
    title: 'BOM versions',
    version: 'Version',
    status: 'Status',
    effectiveFrom: 'Effective from',
    effectiveTo: 'Effective to',
    lines: 'Lines',
    approved: 'Approved',
    none: '—',
    loading: 'Loading BOM versions…',
    empty: 'No BOM versions yet',
    emptyBody: 'This item has no shared BOM version. NPD or Technical creates the first version.',
    error: 'Unable to load BOM versions. Please try again.',
  },
  cost: {
    current: 'Current cost',
    perKg: 'kg',
    effective: 'Effective',
    history: 'Cost history',
    date: 'Date',
    cost: 'Cost / kg',
    source: 'Source',
    none: '—',
    approvalNote: 'V-TEC-53: cost changes greater than 20% require admin approval (reason-logged).',
    sources: {
      manual: 'Manual',
      d365_sync: 'D365 sync',
      supplier_update: 'Supplier update',
      variance_roll: 'Variance roll',
    },
    loading: 'Loading cost history…',
    empty: 'No cost history yet',
    emptyBody: 'No cost roll has been recorded for this item. Edit the cost to start the history.',
    error: 'Unable to load cost history. Please try again.',
  },
  routing: {
    title: 'Routing versions',
    version: 'Version',
    operations: 'Operations',
    setup: 'Setup',
    status: 'Status',
    effectiveFrom: 'Effective from',
    approved: 'Approved',
    none: '—',
    loading: 'Loading routings…',
    empty: 'No routing yet',
    emptyBody: 'No routing version exists for this item. Create one to define its operations.',
    error: 'Unable to load routings. Please try again.',
  },
  lab: {
    title: 'Lab results',
    readOnly: 'Read-only',
    date: 'Date',
    testType: 'Test type',
    result: 'Result',
    unit: 'Unit',
    status: 'Status',
    provider: 'Lab provider',
    none: '—',
    testTypes: {
      atp_swab: 'ATP swab',
      allergen_elisa: 'Allergen ELISA',
      micro_apc: 'Micro APC',
      nutrition: 'Nutrition',
      sensory: 'Sensory',
    },
    statuses: {
      pass: 'Pass',
      fail: 'Fail',
      inconclusive: 'Inconclusive',
      pending: 'Pending',
      hold: 'Hold',
    },
    loading: 'Loading lab results…',
    empty: 'No lab results yet',
    emptyBody: 'Quality has not logged any lab results for this item. Lab results are read-only here.',
    error: 'Unable to load lab results. Please try again.',
  },
  d365: {
    title: 'D365 sync status',
    itemId: 'D365 Item ID',
    syncStatus: 'Sync status',
    lastSync: 'Last sync',
    none: '—',
    error: 'Unable to load D365 status. Please try again.',
    statuses: {
      unsynced: 'Not synced',
      synced: 'Synced',
      drift: 'Drift',
      error: 'Error',
    },
  },
  supplier: {
    title: 'Supplier specifications',
    supplier: 'Supplier',
    supplierStatus: 'Supplier status',
    lifecycleStatus: 'Lifecycle',
    reviewStatus: 'Review',
    specVersion: 'Spec version',
    effectiveFrom: 'Effective from',
    expiryDate: 'Expiry',
    documents: 'Documents',
    none: '—',
    document: 'Spec',
    certificates: 'Certificates',
    loading: 'Loading supplier specs…',
    empty: 'No supplier specs yet',
    emptyBody: 'No supplier specification rows are linked to this item.',
    error: 'Unable to load supplier specs. Please try again.',
  },
};

function translate<T extends Record<string, unknown>>(
  t: (key: string) => string,
  defaults: T,
  prefix = '',
): T {
  const out = {} as T;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = defaults[key];
    const dotted = `${prefix}${String(key)}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = translate(t, value as Record<string, unknown>, `${dotted}.`) as T[keyof T];
    } else {
      try {
        const resolved = t(dotted);
        out[key] = (resolved === dotted ? value : resolved) as T[keyof T];
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

export async function buildDataTabLabels(locale: string): Promise<DataTabLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.items.detail.dataTabs' });
    return translate(t as unknown as (key: string) => string, DEFAULTS);
  } catch {
    return DEFAULTS;
  }
}
