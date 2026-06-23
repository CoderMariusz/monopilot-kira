/**
 * E1 — server-side i18n label resolver for the warehouse Print-history screen.
 *
 * Resolves from the staged printers bundle `_meta/i18n-staging/printers.json`
 * (en + pl real values, `history` namespace) with a defensive guard + EN fallback
 * per missing key — mirroring ../license-plates/lp-labels.ts. Resolved server-side
 * only; the client receives plain strings (ro/uk mirror EN per the two-locale
 * policy). Collapses to a getTranslations wrapper once the bundle is merged.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import stagedBundle from '../../../../../../../../_meta/i18n-staging/printers.json';

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

export function getPrintHistoryTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    let raw = lookup(primary, key) ?? lookup(fallback, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[print-history i18n] missing key: ${key}`);
      const last = key.split('.').pop() ?? key;
      raw = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    }
    return interpolate(raw, values);
  };
  t.has = (key: string): boolean =>
    lookup(primary, key) !== undefined || lookup(fallback, key) !== undefined;
  return t;
}

export type PrintHistoryTranslator = ReturnType<typeof getPrintHistoryTranslator>;
