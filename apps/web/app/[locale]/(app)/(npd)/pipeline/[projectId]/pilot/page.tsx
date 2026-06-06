/**
 * NPD PILOT stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/pilot
 *
 * Server Component. Reads REAL, org-scoped data via the getPilotRun Server
 * Action (RLS as app_user with app.current_org_id()). No mocks, no hard-coded
 * rows. Money/qty are carried as decimal STRINGS end-to-end.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:352-409 (PilotScreen)
 *   (the LEGACY banner at lines 355-361 is intentionally OMITTED — this is a live screen)
 *
 * RBAC: getPilotRun gates on `npd.pilot.read`; the checklist toggle gates on
 * `npd.pilot.write`. permission_denied → the permission-denied state. The write
 * action is wrapped in an inline 'use server' adapter so a serializable function
 * prop crosses the RSC boundary (Next 16 guard).
 */

import { getTranslations } from 'next-intl/server';

import {
  PilotScreen,
  type PageState,
  type PilotLabels,
  type PilotScreenData,
  type ToggleChecklistCall,
  type ToggleChecklistOutcome,
} from './_components/pilot-screen';
import { getPilotRun } from './_actions/get-pilot-run';
import { togglePilotChecklistItem } from './_actions/toggle-pilot-checklist-item';

export const dynamic = 'force-dynamic';

type PilotPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx).
  data?: PilotScreenData | null;
  state?: PageState;
};

type LoaderResult = { state: PageState; data: PilotScreenData | null };

const DEFAULT_LABELS: PilotLabels = {
  title: 'Pilot production',
  breadcrumb: 'NPD / Pilot production',
  scheduledPilot: 'Scheduled pilot:',
  scheduledPilotBody: '{date} · {line} · {batch} batch · Supervisor: {supervisor}',
  supervisorLabel: 'Supervisor',
  noSupervisor: 'Unassigned',
  planTitle: 'Pilot run plan',
  colLine: 'Line',
  colBatchSize: 'Batch size',
  colExpectedYield: 'Expected yield',
  colDuration: 'Duration',
  unitKg: 'kg',
  unitPct: '%',
  unitHours: 'h',
  materialTitle: 'Material reservation',
  colIngredient: 'Ingredient',
  colRequired: 'Required',
  colAvailable: 'Available',
  colReserved: 'Reserved',
  colStatus: 'Status',
  statusReserved: '✓ Reserved',
  statusShort: '⚠ Short {shortBy}',
  shortCallout: 'Materials short by {shortBy}. Raise a PO or reduce the batch size.',
  checklistTitle: 'Pilot checklist',
  loading: 'Loading pilot data…',
  empty: 'No pilot run planned yet',
  emptyBody: 'A pilot run is scheduled once the formulation and trials are complete.',
  error: 'Unable to load pilot data.',
  forbidden: 'You do not have permission to view the pilot stage.',
  notSet: '—',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof PilotLabels>;

function translateLabel(t: (key: string) => string, key: keyof PilotLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<PilotLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.pilot' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as PilotLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function readPageData(projectId: string): Promise<LoaderResult> {
  const result = await getPilotRun({ projectId });
  if (result.ok) {
    return { state: 'ready', data: result.data };
  }
  switch (result.error) {
    case 'forbidden':
      return { state: 'permission_denied', data: null };
    case 'not_found':
      return { state: 'empty', data: null };
    case 'invalid_input':
      return { state: 'error', data: null };
    default:
      return { state: 'error', data: null };
  }
}

export default async function PilotPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PilotPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  // Inline 'use server' adapter — serializable function prop across the RSC
  // boundary (Next 16). The action owns its own RBAC (npd.pilot.write).
  async function toggleChecklistAction(call: ToggleChecklistCall): Promise<ToggleChecklistOutcome> {
    'use server';
    const result = await togglePilotChecklistItem({
      projectId,
      itemId: call.itemId,
      isChecked: call.isChecked,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? { state: props.state ?? (props.data ? 'ready' : 'empty'), data: props.data ?? null }
    : await readPageData(projectId);

  return (
    <PilotScreen
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      onToggleChecklistItem={toggleChecklistAction}
    />
  );
}
