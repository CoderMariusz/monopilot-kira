/**
 * Calibration register — server-side i18n label resolver.
 *
 * Namespace: maintenance.calibration (keys resolved as `list.*`, `instrument.*`, …).
 * Bundle lives in _meta/i18n-staging/calibration.json; orchestrator merges sidecar
 * /tmp/f4/H2-i18n.json into apps/web/i18n at consolidation — code reads the staged
 * bundle until then, exactly mirroring maintenance-labels.ts.
 */
import stagedBundle from '../../../../../../../../_meta/i18n-staging/calibration.json';

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
 * Returns a translator for the staged calibration bundle.
 *
 * Pass bare sub-keys (e.g. `list.title`, `instrument.code`) — the
 * `maintenance.calibration.` prefix is handled by the sidecar namespace at
 * merge time, not here.
 *
 * Resolution order per key: requested locale (pl) -> EN fallback -> humanized
 * last key segment (NEVER leaks the raw dotted key into the UI).
 */
export function getCalibrationTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    let raw = lookup(primary, key) ?? lookup(fallback, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[maintenance.calibration i18n] missing key: ${key}`);
      }
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

export type CalibrationTranslator = ReturnType<typeof getCalibrationTranslator>;
