/**
 * NPD HANDOFF stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/handoff
 *
 * Server Component. Reads REAL, org-scoped data via the getHandoff Server Action
 * (RLS as app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)
 *   (the LEGACY banner at lines 478-484 is intentionally OMITTED — live screen)
 *
 * RBAC: getHandoff gates on `npd.handoff.read`; the checklist toggle gates on
 * `npd.handoff.read` (low-risk, sibling-consistent); promoteToProduction gates on
 * `npd.handoff.promote` and reuses the real factory-release flow (T-096).
 * permission_denied → the permission-denied state. Each write action owns its own
 * RBAC and runs inside an inline 'use server' adapter so a serializable function
 * prop crosses the RSC boundary (Next 16 guard).
 */

import { getTranslations } from 'next-intl/server';

import {
  HandoffScreen,
  type PageState,
  type HandoffHrefs,
  type HandoffLabels,
  type HandoffScreenData,
  type PromoteCall,
  type PromoteOutcome,
  type ToggleChecklistCall,
  type ToggleChecklistOutcome,
} from './_components/handoff-screen';
import { getHandoff } from './_actions/get-handoff';
import { toggleHandoffChecklistItem } from './_actions/toggle-handoff-checklist-item';
import { promoteToProduction } from './_actions/promote-to-production';

export const dynamic = 'force-dynamic';

type HandoffPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors pilot/page.tsx).
  data?: HandoffScreenData | null;
  state?: PageState;
};

type LoaderResult = { state: PageState; data: HandoffScreenData | null };

const DEFAULT_LABELS: HandoffLabels = {
  title: 'Handoff to production BOM',
  breadcrumb: 'NPD / Handoff',
  readyTitle: 'Ready to promote.',
  readyBody:
    'All gates pass. Promoting releases the FG + initial BOM to Production via the release pipeline and deactivates the NPD recipe.',
  blockedTitle: 'Not ready to promote.',
  blockedBody: 'Complete every handoff checklist item before promoting to a production BOM.',
  promotedTitle: 'Promoted.',
  promotedBody: 'This project has been released to the factory. The production BOM is owned by the release pipeline.',
  releaseGatesTitle: 'Release gates',
  releaseGatesBody:
    'Promoting releases the FG + BOM to the factory. Every gate below must pass first — resolve any that are not met.',
  gateMet: 'Met',
  gateUnmet: 'Not met',
  gateRemediation: 'Resolve',
  'gate.G4_REQUIRED': 'Project at gate G4',
  'gate.FG_CANDIDATE_REQUIRED': 'FG product candidate mapped',
  'gate.ACTIVE_SHARED_BOM_REQUIRED': 'Active shared BOM with lines',
  'gate.FACTORY_SPEC_REQUIRED': 'Factory spec approved',
  'gate.V18_OPEN_HIGH_RISK': 'No open high risks',
  promotedNextTitle: 'Next step',
  promotedNextBody:
    'The FG + BOM are released to the factory. Advance the project to Launched, or open the released BOM in Technical.',
  advanceToLaunched: 'Advance to Launched →',
  viewBom: 'View released BOM',
  viewProject: 'Back to project',
  checklistTitle: 'Handoff checklist',
  destinationTitle: 'Destination BOM',
  whatHappensTitle: 'What happens on promote',
  bomCode: 'BOM code',
  productSku: 'Product SKU',
  effectiveFrom: 'Effective from',
  productionLine: 'Production line',
  warehouse: 'Destination warehouse',
  releaseStatus: 'Release status',
  step1: 'Recipe is frozen — no more edits via NPD.',
  step2: 'The shared BOM is released to the Production module.',
  step3: 'The product SKU is activated in Planning.',
  step4: 'The first production order is scheduled.',
  step5: 'Retailer specs are sent to Commercial.',
  step6: 'The NPD project is archived; KPIs roll into the launch report.',
  exportPacket: 'Export handoff packet',
  promote: '✓ Promote to production BOM',
  promoting: 'Promoting…',
  promoteError: 'Promotion failed. Check the gates and try again.',
  loading: 'Loading handoff data…',
  empty: 'No handoff checklist yet',
  emptyBody: 'A handoff checklist is created once the project reaches the handoff stage.',
  error: 'Unable to load handoff data.',
  forbidden: 'You do not have permission to view the handoff stage.',
  notSet: '—',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof HandoffLabels>;

function translateLabel(t: (key: string) => string, key: keyof HandoffLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<HandoffLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.handoff' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as HandoffLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function readPageData(projectId: string): Promise<LoaderResult> {
  const result = await getHandoff({ projectId });
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

export default async function HandoffPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as HandoffPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  // Inline 'use server' adapters — serializable function props across the RSC
  // boundary (Next 16). Each action owns its own RBAC.
  async function toggleChecklistAction(call: ToggleChecklistCall): Promise<ToggleChecklistOutcome> {
    'use server';
    const result = await toggleHandoffChecklistItem({
      projectId,
      itemId: call.itemId,
      isChecked: call.isChecked,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  async function promoteAction(_call: PromoteCall): Promise<PromoteOutcome> {
    'use server';
    const result = await promoteToProduction({ projectId });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? { state: props.state ?? (props.data ? 'ready' : 'empty'), data: props.data ?? null }
    : await readPageData(projectId);

  // Locale-prefixed navigation targets, resolved at the server boundary so the
  // client island never guesses route shapes. Powers the release-gate remediation
  // links + the post-promote next-step CTA (kills the reported dead end).
  const hrefs: HandoffHrefs = {
    factorySpecs: `/${locale}/technical/factory-specs`,
    bom: `/${locale}/technical/bom`,
    project: `/${locale}/pipeline/${projectId}`,
    gate: `/${locale}/pipeline/${projectId}/gate`,
  };

  return (
    <HandoffScreen
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      hrefs={hrefs}
      onPromote={promoteAction}
      onToggleChecklistItem={toggleChecklistAction}
    />
  );
}
