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
  listPrice: string;
  effectiveCost: string;
  /** Optional localized labels for v_item_effective_cost.source tiers. */
  effectiveCostSourceLabels?: Record<string, string>;
  updated: string;
  none: string;
  // Pack hierarchy (migration 267).
  outputUom: string;
  netQtyPerEach: string;
  eachPerBox: string;
  boxesPerPallet: string;
  packHierarchy: string;
  outputUomLabels: { base: string; each: string; box: string };
  // Localized item-type / status value labels (create.typeLabels.* /
  // create.statusLabels.*). Optional so the component stays self-sufficient
  // (English fallback maps below) when a caller omits them.
  typeLabels?: Record<ItemDetail['itemType'], string>;
  statusLabels?: Record<ItemDetail['status'], string>;
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

const TYPE_LABEL_FALLBACK: Record<ItemDetail['itemType'], string> = {
  rm: 'Raw material',
  ingredient: 'Ingredient',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
  packaging: 'Packaging',
};

const STATUS_LABEL_FALLBACK: Record<ItemDetail['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  deprecated: 'Deprecated',
  blocked: 'Blocked',
};

const EFFECTIVE_COST_SOURCE_LABEL_FALLBACK: Record<string, string> = {
  cost_history: 'Cost history',
  supplier_spec: 'Supplier spec',
  list_price: 'List price',
  none: 'None',
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

function fmtEffectiveCost(item: ItemDetail, none: string, sourceLabels: Record<string, string>): string {
  if (item.effectiveCostAmount === null) return none;
  const amount = fmtNum(item.effectiveCostAmount, none);
  if (amount === none) return none;
  const currency = item.effectiveCostCurrency ?? 'GBP';
  const sourceKey = item.effectiveCostSource ?? 'none';
  const sourceLabel = sourceLabels[sourceKey] ?? sourceKey;
  return `${amount} ${currency} (${sourceLabel})`;
}

export function ItemOverviewTab({ item, labels }: { item: ItemDetail; labels: ItemOverviewLabels }) {
  const none = labels.none;
  const typeLabel = labels.typeLabels?.[item.itemType] ?? TYPE_LABEL_FALLBACK[item.itemType];
  const statusLabel = labels.statusLabels?.[item.status] ?? STATUS_LABEL_FALLBACK[item.status];
  const effectiveCostSourceLabels = {
    ...EFFECTIVE_COST_SOURCE_LABEL_FALLBACK,
    ...(labels.effectiveCostSourceLabels ?? {}),
  };
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
          <Row label={labels.type} value={typeLabel} />
          <Row label={labels.status} value={statusLabel} />
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
          <Row
            label={labels.effectiveCost}
            value={fmtEffectiveCost(item, none, effectiveCostSourceLabels)}
            mono
          />
          <Row label={labels.costPerKg} value={fmtNum(item.costPerKg, none)} mono />
          <Row label={labels.listPrice} value={fmtNum(item.listPriceGbp, none)} mono />
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
