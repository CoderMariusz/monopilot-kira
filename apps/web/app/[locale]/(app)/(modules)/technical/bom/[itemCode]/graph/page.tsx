/**
 * T-043 — UI: TEC-083 BOM Graph (where-used) — Server Component page.
 *
 * Route: /[locale]/(app)/technical/bom/[itemCode]/graph
 *   `[itemCode]` resolves to `bom_headers.product_id` (the FG product_code).
 *
 * Standalone route consuming the EXISTING merged BOM read API (getBomDetailPage →
 * withOrgContext + RLS). Real, org-scoped data — the BOM's component lines + the
 * where-used parents. No mocks. Cross-org / unknown FG → notFound() (404).
 *
 * Prototype parity source: bom-detail.jsx:471-544. Red-lines: FG canonical;
 * read-only.
 */

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getBomDetailPage } from '../../_actions/detail-page';
import { BomGraphTab, type GraphData, type GraphTabLabels } from '../../_tabs/graph-tab';

export const dynamic = 'force-dynamic';

const DEFAULT_LABELS: GraphTabLabels = {
  intro: 'Material flow: raw ingredients → sub-BOMs → process → finished product.',
  directionLabel: 'Direction',
  directionDown: 'Explode (down)',
  directionUp: 'Where-used (up)',
  layerRaw: 'Raw materials',
  layerSub: 'Sub-BOMs',
  layerProcess: 'Process',
  layerOutput: 'Finished product',
  layerParents: 'Used in (parent BOMs)',
  emptyComponents: 'This BOM version has no component lines to graph.',
  emptyParents: 'This FG is not used as a component in any other BOM.',
  legendRaw: 'Raw material',
  legendSub: 'Sub-BOM',
  legendProcess: 'Process step',
  legendOutput: 'Finished product',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof GraphTabLabels>;

async function buildLabels(locale: string): Promise<GraphTabLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.bomGraph' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const v = t(key);
        labels[key] = v === key ? DEFAULT_LABELS[key] : v;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as GraphTabLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type GraphPageProps = {
  params?: Promise<{ locale: string; itemCode: string }>;
  searchParams?: Promise<{ v?: string }>;
  // Test-only injection seam.
  data?: GraphData;
};

export default async function BomGraphPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as GraphPageProps;
  const { locale, itemCode } = props.params
    ? await props.params
    : { locale: 'en', itemCode: '' };
  const sp = props.searchParams ? await props.searchParams : {};

  const labels = await buildLabels(locale);

  if (props.data !== undefined) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <BomGraphTab data={props.data} labels={labels} />
      </main>
    );
  }

  const productId = decodeURIComponent(itemCode);
  const versionParam = sp.v ? Number(sp.v) : undefined;
  const version = versionParam && Number.isFinite(versionParam) ? versionParam : undefined;

  const result = await getBomDetailPage(productId, version);
  if (!result.ok) {
    if (result.error === 'not_found') notFound();
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <BomGraphTab data={{ rootCode: productId, rootName: null, components: [], parents: [] }} labels={labels} />
      </main>
    );
  }

  const d = result.data;
  const data: GraphData = {
    rootCode: d.productId,
    rootName: d.productName,
    components: d.lines.map((l) => ({
      id: l.id,
      code: l.componentCode,
      type: l.componentType,
      quantity: l.quantity,
      uom: l.uom,
      operationName: l.manufacturingOperationName,
    })),
    parents: d.whereUsed.map((w) => ({
      productId: w.parentProductId,
      productName: w.parentProductName,
      version: w.parentVersion,
      quantity: w.quantity,
      uom: w.uom,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-6">
      <BomGraphTab data={data} labels={labels} />
    </main>
  );
}
