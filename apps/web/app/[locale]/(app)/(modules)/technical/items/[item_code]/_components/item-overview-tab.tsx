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
  grossWeightMax: string;
  varianceTolerance: string;
  shelfLife: string;
  costPerKg: string;
  updated: string;
  none: string;
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
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
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

export function ItemOverviewTab({ item, labels }: { item: ItemDetail; labels: ItemOverviewLabels }) {
  const none = labels.none;
  const shelf =
    item.shelfLifeDays === null
      ? none
      : `${item.shelfLifeDays} d${item.shelfLifeMode ? ` (${item.shelfLifeMode})` : ''}`;

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
        </dl>
      </div>

      <div className="card">
        <strong className="text-sm">{labels.commercial}</strong>
        <dl className="mt-2">
          <Row label={labels.uomBase} value={item.uomBase} mono />
          <Row label={labels.uomSecondary} value={item.uomSecondary ?? none} mono />
          <Row label={labels.costPerKg} value={fmtNum(item.costPerKg, none)} mono />
          <Row label={labels.weightMode} value={item.weightMode} mono />
          {item.weightMode === 'catch' ? (
            <>
              <Row label={labels.nominalWeight} value={fmtNum(item.nominalWeight, none)} mono />
              <Row label={labels.grossWeightMax} value={fmtNum(item.grossWeightMax, none)} mono />
              <Row label={labels.varianceTolerance} value={fmtNum(item.varianceTolerancePct, none)} mono />
            </>
          ) : null}
          <Row label={labels.shelfLife} value={shelf} mono />
          <Row label={labels.updated} value={fmtDate(item.updatedAt, none)} mono />
        </dl>
      </div>
    </div>
  );
}

export default ItemOverviewTab;
