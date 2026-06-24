/**
 * WAVE W11 — server-side i18n label resolver for the warehouse DIRECT
 * stock-adjustment surface (/warehouse/adjustments/new): location + item picker,
 * increase/decrease, qty + uom, 6 reason codes, optional reason note, increase
 * batch/expiry, decrease specific-LP picker, initiator e-sign + supervisor
 * countersignature.
 *
 * The `warehouse` namespace is NOT yet merged into the live next-intl bundle
 * (apps/web/i18n/{en,pl,ro,uk}.json), so we resolve from the staged bundle
 * `_meta/i18n-staging/warehouse-adjustments.json` (en + pl real values; ro/uk
 * mirror EN per the two-locale policy) with a defensive `t.has` guard + EN
 * fallback per missing key — mirroring the staging pattern the LP / counts lanes
 * established in `license-plates/lp-labels.ts` and `counts/counts-labels.ts`.
 *
 * When the bundle is merged into next-intl this loader collapses to a thin
 * `getTranslations` wrapper. Resolved server-side only; client components receive
 * plain resolved strings.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import stagedBundle from '../../../../../../../../_meta/i18n-staging/warehouse-adjustments.json';

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
 * Returns a translator for the staged warehouse-adjustments bundle.
 *
 * Resolution order per key: requested locale (pl) → EN fallback → humanized last
 * key segment (review rule: NEVER leak the raw dotted key to the UI).
 */
export function getAdjustmentsTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    let raw = lookup(primary, key) ?? lookup(fallback, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[warehouse adjustments i18n] missing key: ${key}`);
      const last = key.split('.').pop() ?? key;
      raw = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    }
    return interpolate(raw, values);
  };
  t.has = (key: string): boolean =>
    lookup(primary, key) !== undefined || lookup(fallback, key) !== undefined;
  return t;
}

export type AdjustmentsTranslator = ReturnType<typeof getAdjustmentsTranslator>;
