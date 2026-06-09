/**
 * N1-A — directive-free shared UI constants/helpers for the ECO screen.
 *
 * Lives in a sibling WITHOUT a 'use server' directive so both Server and Client
 * components can import the non-async values (status→badge tone map, the
 * fallback translator). Nothing async is exported from here.
 */

import type { useTranslations } from 'next-intl';

import type { EcoStatus } from '../_actions/shared';

// 5 semantic tones (MON-design-system rule). draft=neutral, approved=info,
// implementing=in-progress(amber), closed=done(green).
export const ECO_STATUS_BADGE: Record<EcoStatus, string> = {
  draft: 'badge-gray',
  approved: 'badge-blue',
  implementing: 'badge-amber',
  closed: 'badge-green',
};

export const ECO_PRIORITY_BADGE: Record<string, string> = {
  low: 'badge-gray',
  normal: 'badge-blue',
  high: 'badge-amber',
  critical: 'badge-red',
};

export const ECO_FILTERS = ['all', 'draft', 'approved', 'implementing', 'closed'] as const;
export type EcoFilter = (typeof ECO_FILTERS)[number];

/**
 * Wrap a next-intl translator so a missing key (not yet wired into the locale
 * bundle) renders the provided English fallback instead of leaking the dotted
 * key into the DOM. Mirrors the factory-specs `safeLabel`/`tt` pattern.
 */
// The next-intl `Translator` types its `key` as a generated union (not `string`)
// and carries extra overloads (.rich/.markup/.raw), so we accept the real
// translator type and narrow to a plain `(key, values) => string` at the call.
type ClientTranslator = ReturnType<typeof useTranslations>;

export function makeFallback(t: ClientTranslator) {
  return (key: string, fallback: string, values?: Record<string, unknown>): string => {
    try {
      const value = (t as unknown as (k: string, v?: Record<string, unknown>) => string)(key, values);
      return value === key || value.endsWith(`.${key}`) ? fallback : value;
    } catch {
      return fallback;
    }
  };
}
