/**
 * Audit timeline label builder — follows the repo Translator pattern
 * (see quality/haccp/_components/labels.ts).
 *
 * A `Translator` is any `(key: string) => string`:
 *   - RSC pages pass `await getTranslations('audit.timeline')` (next-intl)
 *   - RTL tests pass a vi.fn or a local map lookup
 *
 * Keys live in apps/web/i18n/{en,pl}.json under the `audit.timeline` namespace;
 * the orchestrator merged them from /tmp/f3/G5-i18n.json at consolidation.
 */

export type Translator = (key: string) => string;

export type AuditTimelineLabels = {
  title: string;
  subtitle: string;
  empty: string;
  emptyBody: string;
  colWhen: string;
  colActor: string;
  colAction: string;
  detailsToggle: string;
  showMore: string;
  loadingMore: string;
  unknownActor: string;
  source: Record<'audit_events' | 'audit_log' | 'status_history', string>;
};

export function buildAuditTimelineLabels(t: Translator): AuditTimelineLabels {
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    empty: t('empty'),
    emptyBody: t('emptyBody'),
    colWhen: t('colWhen'),
    colActor: t('colActor'),
    colAction: t('colAction'),
    detailsToggle: t('detailsToggle'),
    showMore: t('showMore'),
    loadingMore: t('loadingMore'),
    unknownActor: t('unknownActor'),
    source: {
      audit_events: t('source.audit_events'),
      audit_log: t('source.audit_log'),
      status_history: t('source.status_history'),
    },
  };
}
