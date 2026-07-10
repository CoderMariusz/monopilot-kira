import { describe, expect, it } from 'vitest';

import en from '../en.json';
import pl from '../pl.json';
import ro from '../ro.json';
import uk from '../uk.json';

const LOCALES = {
  en,
  pl,
  ro,
  uk,
} as const;

/** Key paths introduced/fixed in wave-4 Bug 3 — must exist in all four locales. */
const WAVE4_KEY_PATHS = [
  'Technical.factorySpecs.cloneNewVersion',
  'Technical.factorySpecs.release.action',
  'Technical.factorySpecs.release.permissionTooltip',
  'Technical.factorySpecs.release.title',
  'Technical.factorySpecs.release.body',
  'Technical.factorySpecs.release.confirm',
  'Technical.factorySpecs.release.submitting',
  'Technical.factorySpecs.release.cancel',
  'Technical.factorySpecs.release.errors.forbidden',
  'Technical.factorySpecs.release.errors.generic',
  'Technical.factorySpecs.release.handoffRequired',
  'Technical.factorySpecs.release.handoffTooltip',
  'Planning.workOrders.list.pagination.showing',
  'Planning.workOrders.list.pagination.previous',
  'Planning.workOrders.list.pagination.next',
  'Planning.purchaseOrders.list.pagination.showing',
  'Planning.purchaseOrders.list.pagination.previous',
  'Planning.purchaseOrders.list.pagination.next',
  'Planning.transferOrders.list.pagination.showing',
  'Planning.transferOrders.list.pagination.previous',
  'Planning.transferOrders.list.pagination.next',
  'npd.faRightPanel.totalYield',
  'npd.projectWizard.fieldOutputUnit',
  'npd.projectWizard.fieldOutputUnitKg',
  'npd.projectWizard.fieldOutputUnitPieces',
  'npd.projectWizard.fieldOutputUnitBoxes',
  'npd.projectWizard.errorBoxesOutputUnit',
  'npd.briefStage.errOutputUnitBoxesPackFactors',
  'technical.wip.process.yieldPct',
  'npd.handoff.revertToNpd',
  'npd.packaging.supplierPlaceholder',
  'npd.packaging.supplierLegacyHint',
  'Planning.workOrders.create.chainCreatedWarning',
  'production.wos.pagination.showing',
  'production.wos.pagination.previous',
  'production.wos.pagination.next',
  'technical.items.list.pagination.showing',
  'technical.items.list.pagination.previous',
  'technical.items.list.pagination.next',
  'technical.materials.pagination.showing',
  'technical.materials.pagination.previous',
  'technical.materials.pagination.next',
] as const;

function getAtPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object' && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

function collectLeafPaths(node: unknown, prefix: string): string[] {
  if (typeof node === 'string') {
    return prefix ? [prefix] : [];
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return [];
  }
  const entries = Object.entries(node as Record<string, unknown>);
  if (entries.length === 0) return [];
  return entries.flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') return [next];
    return collectLeafPaths(value, next);
  });
}

const FA_PRODUCTION_TAB_PATHS = collectLeafPaths(
  (en as { npd: { faProductionTab: unknown } }).npd.faProductionTab,
  'npd.faProductionTab',
);

const ALL_WAVE4_KEY_PATHS = [...WAVE4_KEY_PATHS, ...FA_PRODUCTION_TAB_PATHS];

function isRealString(value: unknown, path: string): boolean {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value !== path &&
    !value.startsWith('MISSING_MESSAGE')
  );
}

describe('wave-4 locale parity', () => {
  for (const path of ALL_WAVE4_KEY_PATHS) {
    it.each(Object.keys(LOCALES))('%s has %s', (locale) => {
      const value = getAtPath(LOCALES[locale as keyof typeof LOCALES], path);
      expect(isRealString(value, path), `${locale}:${path}=${String(value)}`).toBe(true);
    });
  }
});
