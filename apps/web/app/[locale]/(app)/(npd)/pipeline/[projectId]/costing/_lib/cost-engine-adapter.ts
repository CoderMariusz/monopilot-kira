/**
 * Thin adapter between the cost-engine loader contract and CostingScreen UI.
 * Contract tweaks should land here only.
 */

import { Dec } from '@monopilot/domain';

export type CostEngineUnits = {
  packWeightKg: string | null;
  packsPerCase: number | null;
  avgBatchQty: string | null;
  fgBaseUom: string | null;
  packsPerBatch: string | null;
};

export type CostEngineStepKey =
  | 'raw_materials'
  | 'yield_loss'
  | 'process_labour'
  | 'setup'
  | 'packaging'
  | 'overhead'
  | 'logistics'
  | 'total'
  | 'margin';

export type CostEngineResult = {
  status: 'ok' | 'fail' | 'blocked';
  missing: string[];
  /** Margin percentage from the breakdown summary; distinct from the margin amount step. */
  marginPct?: string;
  steps: Array<{ key: CostEngineStepKey; valuePerPackEur: string }>;
  units: CostEngineUnits;
};

export type WaterfallRowView = {
  key: CostEngineStepKey;
  label: string;
  perKg: string | null;
  perPack: string;
  perBatch: string | null;
  isTotal: boolean;
};

const STEP_ORDER: CostEngineStepKey[] = [
  'raw_materials',
  'yield_loss',
  'process_labour',
  'setup',
  'packaging',
  'overhead',
  'logistics',
  'total',
  'margin',
];

/** Default EN labels; PL mandated names noted in i18n report. */
export const DEFAULT_STEP_LABELS: Record<CostEngineStepKey, string> = {
  raw_materials: 'Surowce',
  yield_loss: 'Strata',
  process_labour: 'Praca procesów',
  setup: 'Setup',
  packaging: 'Opakowania',
  overhead: 'Overhead',
  logistics: 'Logistyka',
  total: 'Koszt całkowity',
  margin: 'Marża vs cena docelowa',
};

export type MissingItemLink = {
  key: string;
  label: string;
  href: string;
};

function trimDecimal(value: string): string {
  return value.trim();
}

function isPositiveDecimal(value: string | null | undefined): value is string {
  if (value == null) return false;
  const trimmed = trimDecimal(value);
  return /^-?\d+(\.\d+)?$/.test(trimmed) && Dec.from(trimmed).cmp(Dec.zero()) > 0;
}

/** Display-only derivation — never persisted. */
function divideDecimal(a: string, b: string): string | null {
  const numerator = trimDecimal(a);
  const denominator = trimDecimal(b);
  if (!/^-?\d+(\.\d+)?$/.test(numerator) || !isPositiveDecimal(denominator)) return null;
  return Dec.from(numerator).div(Dec.from(denominator)).toFixed(4);
}

/** Display-only derivation — never persisted. */
function multiplyDecimal(a: string, b: string): string | null {
  const value = trimDecimal(a);
  const factor = trimDecimal(b);
  if (!/^-?\d+(\.\d+)?$/.test(value) || !/^-?\d+(\.\d+)?$/.test(factor)) return null;
  return Dec.from(value).mul(Dec.from(factor)).toFixed(4);
}

export function adaptWaterfallRows(
  result: CostEngineResult,
  labels: Partial<Record<CostEngineStepKey, string>> = {},
): WaterfallRowView[] {
  const byKey = new Map(result.steps.map((step) => [step.key, step.valuePerPackEur]));
  const { packWeightKg, packsPerBatch } = result.units;

  return STEP_ORDER.map((key) => {
    const perPack = byKey.get(key) ?? '0';
    const perKg = isPositiveDecimal(packWeightKg) ? divideDecimal(perPack, packWeightKg) : null;
    const perBatch = isPositiveDecimal(packsPerBatch) ? multiplyDecimal(perPack, packsPerBatch) : null;
    return {
      key,
      label: labels[key] ?? DEFAULT_STEP_LABELS[key],
      perKg,
      perPack,
      perBatch,
      isTotal: key === 'total',
    };
  });
}

const MISSING_LINK_RULES: Array<{
  match: RegExp;
  label: string;
  segment: 'formulation' | 'brief' | 'packaging';
}> = [
  { match: /yield/i, label: 'Yield', segment: 'formulation' },
  { match: /volume|weekly/i, label: 'Weekly volume', segment: 'brief' },
  { match: /runs/i, label: 'Runs per week', segment: 'brief' },
  { match: /packs?_per_case|packaging/i, label: 'Packs per case', segment: 'packaging' },
];

export function adaptMissingChecklist(
  missing: string[],
  locale: string,
  projectId: string,
): MissingItemLink[] {
  const base = `/${locale}/pipeline/${projectId}`;
  const seen = new Set<string>();

  return missing.flatMap((item) => {
    const rule = MISSING_LINK_RULES.find((r) => r.match.test(item));
    if (!rule || seen.has(rule.segment)) return [];
    seen.add(rule.segment);
    return [
      {
        key: item,
        label: rule.label,
        href: `${base}/${rule.segment}`,
      },
    ];
  });
}
