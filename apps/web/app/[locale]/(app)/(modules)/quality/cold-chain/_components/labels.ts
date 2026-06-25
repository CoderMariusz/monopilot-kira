/**
 * Cold-chain viewer (gaps #9) — label builder.
 *
 * Resolves the LIVE next-intl `quality.coldChain` namespace
 * (apps/web/i18n/{en,pl,ro,uk}.json — real en + pl, uk/ro mirror EN per the
 * locale lesson) into the typed label object the client island consumes.
 * A `Translator` is any `(key, values?) => string` — both next-intl's
 * `getTranslations('quality.coldChain')` (RSC) and a vi.fn-backed test
 * translator satisfy it, so the RSC page and the RTL test assert the same
 * resolved strings.
 */

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export type ColdChainLabels = {
  ranges: {
    heading: string;
    caption: string;
    colProduct: string;
    colSite: string;
    colMin: string;
    colMax: string;
    colRequiresCheck: string;
    requiresCheckYes: string;
    requiresCheckNo: string;
    siteAll: string;
    unbounded: string;
    empty: string;
  };
  checks: {
    heading: string;
    caption: string;
    colProduct: string;
    colSite: string;
    colMeasured: string;
    colRange: string;
    colResult: string;
    colWhen: string;
    pass: string;
    fail: string;
    hold: string;
    unknownSite: string;
    empty: string;
  };
  recordHint: string;
};

export function buildColdChainLabels(t: Translator): ColdChainLabels {
  return {
    ranges: {
      heading: t('ranges.heading'),
      caption: t('ranges.caption'),
      colProduct: t('ranges.colProduct'),
      colSite: t('ranges.colSite'),
      colMin: t('ranges.colMin'),
      colMax: t('ranges.colMax'),
      colRequiresCheck: t('ranges.colRequiresCheck'),
      requiresCheckYes: t('ranges.requiresCheckYes'),
      requiresCheckNo: t('ranges.requiresCheckNo'),
      siteAll: t('ranges.siteAll'),
      unbounded: t('ranges.unbounded'),
      empty: t('ranges.empty'),
    },
    checks: {
      heading: t('checks.heading'),
      caption: t('checks.caption'),
      colProduct: t('checks.colProduct'),
      colSite: t('checks.colSite'),
      colMeasured: t('checks.colMeasured'),
      colRange: t('checks.colRange'),
      colResult: t('checks.colResult'),
      colWhen: t('checks.colWhen'),
      pass: t('checks.pass'),
      fail: t('checks.fail'),
      hold: t('checks.hold'),
      unknownSite: t('checks.unknownSite'),
      empty: t('checks.empty'),
    },
    recordHint: t('recordHint'),
  };
}
