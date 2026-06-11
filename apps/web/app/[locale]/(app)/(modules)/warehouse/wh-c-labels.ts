/**
 * WAREHOUSE LANE-C — server-side i18n label resolver for the GRN / Inventory /
 * Movements / Reservations surfaces (WH-010, WH-012, WH-006, WH-017).
 *
 * The `warehouse` namespace is NOT yet merged into the live next-intl bundle
 * (apps/web/i18n/{en,pl,ro,uk}.json), so we resolve from the staged bundle
 * `_meta/i18n-staging/warehouse-c.json` (en + pl real values) with a defensive
 * `t.has` guard + EN fallback per missing key — mirroring the staging pattern
 * the parallel LP lane established in `warehouse/license-plates/lp-labels.ts`.
 *
 * When the bundle is merged into next-intl this loader collapses to a thin
 * `getTranslations` wrapper. Resolved server-side only; client components
 * receive plain resolved strings.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import stagedBundle from '../../../../../../../_meta/i18n-staging/warehouse-c.json';

type MsgTree = { [k: string]: string | MsgTree };

const BUNDLE = stagedBundle as unknown as { en: MsgTree; pl: MsgTree };

function lookup(tree: MsgTree | undefined, dotted: string): string | undefined {
  if (!tree) return undefined;
  let cur: string | MsgTree | undefined = tree;
  for (const part of dotted.split('.')) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = (cur as MsgTree)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) =>
    values[key] !== undefined ? String(values[key]) : `{${key}}`,
  );
}

/**
 * Returns a translator for the staged warehouse-c bundle.
 *
 * Resolution order per key: requested locale (pl) → EN fallback → the dotted key
 * itself (so a never-resolved key is visible in dev, never a thrown error).
 */
export function getWhcTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    const raw = lookup(primary, key) ?? lookup(fallback, key) ?? key;
    return interpolate(raw, values);
  };
  t.has = (key: string): boolean =>
    lookup(primary, key) !== undefined || lookup(fallback, key) !== undefined;
  return t;
}

export type WhcTranslator = ReturnType<typeof getWhcTranslator>;
