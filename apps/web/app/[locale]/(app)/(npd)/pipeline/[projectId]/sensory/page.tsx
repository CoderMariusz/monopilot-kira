/**
 * Fala-3 — Sensory stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/sensory
 *
 * Server Component. READ-ONLY display of the 03-Technical-owned sensory PANEL for
 * the project's product. Reads REAL, org-scoped data via getSensoryPanel
 * (withOrgContext → RLS as app_user with app.current_org_id()). No mocks, no
 * hard-coded rows, and NO write path (writes belong to Technical).
 *
 * RBAC: getSensoryPanel gates on `technical.sensory.read` server-side and returns
 * `permission_denied` when the caller lacks it — never trusted from the client.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:259-350 (SensoryScreen)
 *
 * Scores stay NUMERIC-exact: every score/benchmark column is read as a decimal
 * STRING in the loader — never coerced to a JS float here.
 */

import { getTranslations } from 'next-intl/server';

import { getSensoryPanel, type SensoryPanelState } from './_actions/getSensoryPanel';
import {
  SensoryScreen,
  type PageState,
  type SensoryLabels,
  type SensoryScreenData,
} from './_components/sensory-screen';
import { loadStageDeptSections } from '../../../../../../(npd)/pipeline/_actions/load-stage-dept-sections';
import { StageDeptSections } from '../../../../../../(npd)/pipeline/_components/StageDeptSections';

export const dynamic = 'force-dynamic';

type SensoryPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx).
  data?: SensoryScreenData | null;
  state?: PageState;
};

const DEFAULT_LABELS: SensoryLabels = {
  title: 'Sensory panel',
  subtitle: '{count} panelists · blind tasting · {date}',
  exportScores: 'Export scores',
  colAttribute: 'Attribute',
  colScore: 'Score /10',
  colVsBenchmark: 'vs benchmark',
  overall: 'Overall',
  aboveBenchmark: '✓ Above benchmark ({score})',
  belowBenchmark: 'Below benchmark ({score})',
  commentsTitle: 'Panelist comments',
  loading: 'Loading sensory panel…',
  empty: 'No sensory panel recorded for this product yet',
  emptyBody: 'Sensory evaluation is owned by Technical and will appear here once a panel is recorded.',
  error: 'Unable to load the sensory panel.',
  forbidden: 'You do not have permission to view the sensory panel.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof SensoryLabels>;

function translateLabel(t: (key: string) => string, key: keyof SensoryLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<SensoryLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.sensory' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as SensoryLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

/** Map the read-action state to the component page state. */
function toPageState(state: SensoryPanelState): PageState {
  return state;
}

async function readStageSections(projectId: string) {
  if (!projectId) return null;
  try {
    return await loadStageDeptSections({ projectId, stage: 'sensory' });
  } catch (error) {
    console.error('[sensory] stage department sections read failed:', error);
    return null;
  }
}

async function getCloseSectionLabel(locale: string): Promise<string> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.stageDeptSections' });
    const value = t('closeSection');
    return value === 'closeSection' ? 'Close {dept} section' : value;
  } catch {
    return 'Close {dept} section';
  }
}

export default async function SensoryPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as SensoryPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);
  const closeSectionLabel = await getCloseSectionLabel(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const stageSections = await readStageSections(projectId);

  if (injected) {
    return (
      <>
        <SensoryScreen
          state={props.state ?? (props.data ? 'ready' : 'empty')}
          data={props.data ?? null}
          labels={labels}
        />
        {stageSections ? <StageDeptSections projectId={projectId} stage="sensory" data={stageSections} closeSectionLabel={closeSectionLabel} /> : null}
      </>
    );
  }

  const result = await getSensoryPanel(projectId);

  return (
    <>
      <SensoryScreen
        state={toPageState(result.state)}
        data={result.data}
        labels={labels}
      />
      {stageSections ? <StageDeptSections projectId={projectId} stage="sensory" data={stageSections} closeSectionLabel={closeSectionLabel} /> : null}
    </>
  );
}
