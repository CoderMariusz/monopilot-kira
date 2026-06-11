/**
 * T-034 — TEC-012 Item Detail · Overview tab body (server-rendered).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:373-395 (`MaterialDetailScreen` overview — two summary cards:
 * Identification + Compliance/commercial). Translated to two @monopilot/ui Card
 * blocks each holding a definition list. Data is the REAL item row passed from the
 * RSC page (getItem action under withOrgContext + RLS) — no mocks.
 *
 * Pure presentational: no client state, no Radix. Strings arrive pre-localized
 * from the page (next-intl getTranslations) so this stays a Server Component.
 */

import type { ItemDetail } from '../../_actions/get-item';

export type ItemOverviewLabels = {
  identification: string;
  commercial: string;
  code: string;
  name: string;
  type: string;
  status: string;
  uomBase: string;
  uomSecondary: string;
  productGroup: string;
  description: string;
  weightMode: string;
  nominalWeight: string;
  tareWeight: string;
  grossWeightMax: string;
  gs1Gtin: string;
  varianceTolerance: string;
  shelfLife: string;
  costPerKg: string;
  updated: string;
  none: string;
  // Pack hierarchy (migration 267).
  outputUom: string;
  netQtyPerEach: string;
  eachPerBox: string;
  boxesPerPallet: string;
  packHierarchy: string;
  outputUomLabels: { base: string; each: string; box: string };
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-1.5"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <dt className="text-sm" style={{ color: 'var(--muted)' }}>
        {label}
      </dt>
      <dd className={`text-sm ${mono ? 'mono tabular-nums' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}

const TYPE_LABEL: Record<ItemDetail['itemType'], string> = {
  rm: 'Raw material',
  ingredient: 'Ingredient',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
  packaging: 'Packaging',
};

const STATUS_LABEL: Record<ItemDetail['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  deprecated: 'Deprecated',
  blocked: 'Blocked',
};

function fmtNum(value: string | null, none: string): string {
  if (value === null) return none;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : none;
}

function fmtDate(value: string, none: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? none : d.toISOString().slice(0, 10);
}

function fmtQty(value: string | null): string {
  if (value === null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

export function ItemOverviewTab({ item, labels }: { item: ItemDetail; labels: ItemOverviewLabels }) {
  const none = labels.none;
  const shelf =
    item.shelfLifeDays === null
      ? none
      : `${item.shelfLifeDays} d${item.shelfLifeMode ? ` (${item.shelfLifeMode})` : ''}`;

  // Pack hierarchy (migration 267). Honest "—" when not set. Defensive defaults
  // keep partial test fixtures / pre-267 rows rendering (output_uom defaults 'base').
  const outputUom = item.outputUom ?? 'base';
  const outputUomLabels = labels.outputUomLabels ?? { base: 'Base unit', each: 'Each (piece)', box: 'Box' };
  const outputUomLabel = outputUomLabels[outputUom] ?? outputUom;
  const netNum = item.netQtyPerEach == null ? null : Number(item.netQtyPerEach);
  const hasNet = netNum !== null && Number.isFinite(netNum) && netNum > 0;
  // Conversion line: e.g. "1 box = 10 × 0.100 kg = 1.000 kg".
  let packHierarchy = outputUomLabel;
  if (outputUom === 'each' && hasNet) {
    packHierarchy = `${outputUomLabel} · 1 = ${fmtQty(item.netQtyPerEach)} ${item.uomBase}`;
  } else if (outputUom === 'box' && hasNet && item.eachPerBox && item.eachPerBox > 0) {
    const total = (netNum as number) * item.eachPerBox;
    packHierarchy = `${outputUomLabel} · 1 = ${item.eachPerBox} × ${fmtQty(item.netQtyPerEach)} ${item.uomBase} = ${fmtQty(String(total))} ${item.uomBase}`;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="card">
        <strong className="text-sm">{labels.identification}</strong>
        <dl className="mt-2">
          <Row label={labels.code} value={item.itemCode} mono />
          <Row label={labels.name} value={item.name} />
          <Row label={labels.type} value={TYPE_LABEL[item.itemType]} />
          <Row label={labels.status} value={STATUS_LABEL[item.status]} />
          <Row label={labels.productGroup} value={item.productGroup ?? none} />
          <Row label={labels.description} value={item.description ?? none} />
          <Row label={labels.gs1Gtin} value={item.gs1Gtin ?? none} mono />
        </dl>
      </div>

      <div className="card">
        <strong className="text-sm">{labels.commercial}</strong>
        <dl className="mt-2">
          <Row label={labels.uomBase} value={item.uomBase} mono />
          <Row label={labels.uomSecondary} value={item.uomSecondary ?? none} mono />
          <Row label={labels.outputUom} value={outputUomLabel} />
          <Row label={labels.packHierarchy} value={outputUom === 'base' ? none : packHierarchy} mono />
          <Row label={labels.netQtyPerEach} value={hasNet ? `${fmtQty(item.netQtyPerEach)} ${item.uomBase}` : none} mono />
          <Row label={labels.eachPerBox} value={item.eachPerBox != null ? String(item.eachPerBox) : none} mono />
          <Row label={labels.boxesPerPallet} value={item.boxesPerPallet != null ? String(item.boxesPerPallet) : none} mono />
          <Row label={labels.costPerKg} value={fmtNum(item.costPerKg, none)} mono />
          <Row label={labels.weightMode} value={item.weightMode} mono />
          <Row label={labels.nominalWeight} value={fmtNum(item.nominalWeight, none)} mono />
          <Row label={labels.tareWeight} value={fmtNum(item.tareWeight, none)} mono />
          <Row label={labels.grossWeightMax} value={fmtNum(item.grossWeightMax, none)} mono />
          <Row label={labels.varianceTolerance} value={fmtNum(item.varianceTolerancePct, none)} mono />
          <Row label={labels.shelfLife} value={shelf} mono />
          <Row label={labels.updated} value={fmtDate(item.updatedAt, none)} mono />
        </dl>
      </div>
    </div>
  );
}

export default ItemOverviewTab;
