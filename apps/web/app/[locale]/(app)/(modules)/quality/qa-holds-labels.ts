/**
 * QUALITY HOLDS — server-side i18n label resolver for the QA-002 holds list,
 * QA-002a hold detail, MODAL-HOLD-CREATE / MODAL-HOLD-RELEASE modals and the
 * quality module landing nav.
 *
 * The `quality` holds namespace is NOT yet merged into the live next-intl bundle
 * (apps/web/i18n/{en,pl,ro,uk}.json), so we resolve from the staged bundle
 * `_meta/i18n-staging/quality-holds.json` (en + pl real values) — mirroring the
 * FIXED warehouse loader (warehouse/wh-c-labels.ts): per key the resolution order
 * is requested locale (pl) -> EN fallback -> humanized last key segment. The raw
 * dotted key is NEVER leaked into the UI.
 *
 * When the bundle is merged into next-intl this loader collapses to a thin
 * `getTranslations` wrapper. Resolved server-side only; client components receive
 * plain resolved strings.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import stagedBundle from '../../../../../../../_meta/i18n-staging/quality-holds.json';

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
 * Returns a translator for the staged quality-holds bundle.
 *
 * Resolution order per key: requested locale (pl) -> EN fallback -> humanized last
 * key segment (review rule: NEVER leak the raw dotted "a.b.cKey" into the UI).
 */
export function getQaHoldsTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    let raw = lookup(primary, key) ?? lookup(fallback, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[quality-holds i18n] missing key: ${key}`);
      const last = key.split('.').pop() ?? key;
      raw = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    }
    return interpolate(raw, values);
  };
  t.has = (key: string): boolean =>
    lookup(primary, key) !== undefined || lookup(fallback, key) !== undefined;
  return t;
}

export type QaHoldsTranslator = ReturnType<typeof getQaHoldsTranslator>;
