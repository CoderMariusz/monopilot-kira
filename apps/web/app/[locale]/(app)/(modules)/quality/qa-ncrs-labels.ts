/**
 * QUALITY NCRs — server-side i18n label resolver for the QA-009 NCR list,
 * QA-009a NCR detail, MODAL-NCR-CREATE / MODAL-NCR-CLOSE modals and the quality
 * module landing NCR nav card.
 *
 * The `quality` NCR namespace is NOT yet merged into the live next-intl bundle
 * (apps/web/i18n/{en,pl,ro,uk}.json), so we resolve from the staged bundle
 * `_meta/i18n-staging/quality-ncrs.json` (en + pl real values) — mirroring the
 * FIXED qa-holds-labels.ts loader (which itself mirrors warehouse/wh-c-labels.ts):
 * per key the resolution order is requested locale (pl) -> EN fallback ->
 * humanized last key segment. The raw dotted key is NEVER leaked into the UI.
 *
 * When the bundle is merged into next-intl this loader collapses to a thin
 * `getTranslations` wrapper. Resolved server-side only; client components receive
 * plain resolved strings.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import stagedBundle from '../../../../../../../_meta/i18n-staging/quality-ncrs.json';

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
 * Returns a translator for the staged quality-ncrs bundle.
 *
 * Resolution order per key: requested locale (pl) -> EN fallback -> humanized last
 * key segment (review rule: NEVER leak the raw dotted "a.b.cKey" into the UI).
 */
export function getQaNcrsTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    let raw = lookup(primary, key) ?? lookup(fallback, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[quality-ncrs i18n] missing key: ${key}`);
      const last = key.split('.').pop() ?? key;
      raw = last
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
    }
    return interpolate(raw, values);
  };
  t.has = (key: string): boolean =>
    lookup(primary, key) !== undefined || lookup(fallback, key) !== undefined;
  return t;
}

export type QaNcrsTranslator = ReturnType<typeof getQaNcrsTranslator>;
