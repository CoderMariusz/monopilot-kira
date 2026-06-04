/**
 * T-129 — Pipeline SplitView shared label type (split_view prototype).
 *
 * Distinct i18n surface from the Kanban view: every visible SplitView/
 * ProjectDetailPanel string is keyed under the NEW namespace `npd.pipelineSplit`
 * (apps/web/i18n/{en,pl,ro,uk}.json). The RSC (T-130 view switcher) resolves the
 * namespace and passes a fully-populated SplitLabels down — the Client Components
 * never call next-intl directly and never inline a user-facing string.
 */

import type { ProjectGate } from './kanban-types';

export type SplitLabels = {
  title: string;
  subtitle: string;
  // table columns (left compact list)
  colCode: string;
  colName: string;
  colType: string;
  colGate: string;
  colOwner: string;
  colProgress: string;
  colTarget: string;
  colPrio: string;
  // landmark labels
  listLabel: string;
  detailLabel: string;
  // gate column labels (Stage-Gate model G0..Launched)
  gateG0: string;
  gateG1: string;
  gateG2: string;
  gateG3: string;
  gateG4: string;
  gateLaunched: string;
  // priority badge labels
  prioHigh: string;
  prioNormal: string;
  prioLow: string;
  // detail-panel field labels
  fieldOwner: string;
  fieldGate: string;
  fieldCreated: string;
  fieldTarget: string;
  fieldType: string;
  progress: string;
  recentActivity: string;
  noActivity: string;
  noOwner: string;
  noTarget: string;
  openProject: string;
  // states + placeholders
  loading: string;
  empty: string;
  emptyBody: string;
  emptyDetail: string;
  error: string;
  forbidden: string;
};

export function gateLabelOf(gate: ProjectGate, labels: SplitLabels): string {
  switch (gate) {
    case 'G0':
      return labels.gateG0;
    case 'G1':
      return labels.gateG1;
    case 'G2':
      return labels.gateG2;
    case 'G3':
      return labels.gateG3;
    case 'G4':
      return labels.gateG4;
    case 'Launched':
      return labels.gateLaunched;
    default:
      return gate;
  }
}
