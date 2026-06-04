/**
 * T-082 — Risk register page (SCR-12, per-FA).
 *
 * Server Component. Reads REAL, org-scoped risks from public.risks via the T-081
 * `listRisks` Server Action (RLS-enforced as app_user with app.current_org_id()).
 * No mocks, no hard-coded rows. Create/update are wired to the T-081 createRisk /
 * updateRisk Server Actions (owned by T-081 — imported, never authored here).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:56-106 (RiskRegisterScreen)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:297-346    (RiskAddModal)
 */

import { getTranslations } from 'next-intl/server';

import {
  RiskRegisterScreen,
  type PageState,
  type RiskRegisterLabels,
  type RiskRow,
} from './_components/risk-register-screen';
import { createRisk } from '../../../../../../(npd)/fa/[productCode]/risks/_actions/create-risk';
import { listRisks } from '../../../../../../(npd)/fa/[productCode]/risks/_actions/list-risks';
import { updateRisk } from '../../../../../../(npd)/fa/[productCode]/risks/_actions/update-risk';

export const dynamic = 'force-dynamic';

type RiskPageProps = {
  params?: Promise<{ locale: string; productCode: string }>;
  // Test-only injection seam (mirrors fa/page.tsx convention).
  rows?: RiskRow[];
  canWrite?: boolean;
  state?: PageState;
};

const DEFAULT_LABELS: RiskRegisterLabels = {
  title: 'Risk register',
  subtitle: 'Score = Likelihood × Impact (1=Low, 2=Med, 3=High).',
  addRisk: '+ Add risk',
  filterState: 'State',
  filterBucket: 'Severity',
  clearFilters: 'Clear filters',
  stateAll: 'All states',
  bucketAll: 'All severities',
  colScore: 'Score',
  colDescription: 'Description',
  colLikelihood: 'Likelihood',
  colImpact: 'Impact',
  colStatus: 'Status',
  colOwner: 'Owner',
  colMitigation: 'Mitigation',
  colActions: 'Actions',
  edit: 'Edit',
  bucketHigh: 'High',
  bucketMed: 'Med',
  bucketLow: 'Low',
  stateOpen: 'Open',
  stateMitigated: 'Mitigated',
  stateClosed: 'Closed',
  builtBlocked: 'Built blocked',
  builtBlockedBody: 'An open High-severity risk blocks this FA from being built. Mitigate or close it first.',
  loading: 'Loading risks…',
  empty: 'No risks logged yet',
  emptyBody:
    'Track risks to launch: likelihood × impact. Add a risk to capture mitigation owner and status.',
  error: 'Unable to load risks. Try again after the backend is available.',
  forbidden: 'You do not have permission to view risks for this FA.',
  modalTitleAdd: 'Add risk',
  modalTitleEdit: 'Edit risk',
  fieldDescription: 'Description',
  fieldDescriptionHint: 'Max 300 chars. Describe the risk and business impact.',
  fieldLikelihood: 'Likelihood',
  fieldImpact: 'Impact',
  fieldMitigation: 'Mitigation plan',
  fieldMitigationHint: 'Max 500 chars.',
  fieldOwner: 'Owner',
  fieldStatus: 'Status',
  fieldReason: 'Reason',
  fieldReasonHint: 'Required for lifecycle changes — min 10 chars.',
  scoreLabel: 'Risk score',
  likelihoodLow: 'Low (1)',
  likelihoodMed: 'Med (2)',
  likelihoodHigh: 'High (3)',
  impactLow: 'Low (1)',
  impactMed: 'Med (2)',
  impactHigh: 'High (3)',
  cancel: 'Cancel',
  save: 'Save',
  create: 'Add risk',
  mitigate: 'Mitigate',
  close: 'Close',
  reopen: 'Reopen',
  errorRequired: 'Description is required.',
  errorTooLong: 'Too long.',
  errorReasonShort: 'Reason must be at least 10 characters.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof RiskRegisterLabels>;

function translateLabel(t: (key: string) => string, key: keyof RiskRegisterLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<RiskRegisterLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.risks' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as RiskRegisterLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type LoaderResult = { state: PageState; rows: RiskRow[] };

async function readPageData(productCode: string): Promise<LoaderResult> {
  try {
    const result = await listRisks({ productCode });
    if (!result.ok) {
      return { state: 'error', rows: [] };
    }
    const rows: RiskRow[] = result.risks.map((risk) => ({
      id: risk.id,
      productCode: risk.product_code,
      title: risk.title,
      description: risk.description,
      likelihood: risk.likelihood,
      impact: risk.impact,
      score: risk.score,
      bucket: risk.bucket,
      state: risk.state,
      mitigation: risk.mitigation,
      owner: risk.owner_user_id,
    }));
    return { state: rows.length === 0 ? 'empty' : 'ready', rows };
  } catch (error) {
    console.error('[risk-register] org-scoped read failed:', error);
    return { state: 'error', rows: [] };
  }
}

export default async function RiskRegisterPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as RiskPageProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const labels = await buildLabels(locale);

  const injected = Array.isArray(props.rows);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.rows?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rows: props.rows ?? [],
      }
    : await readPageData(productCode);

  return (
    <RiskRegisterScreen
      productCode={productCode}
      rows={loaded.rows}
      labels={labels}
      canWrite={props.canWrite ?? true}
      state={props.state ?? loaded.state}
      createRiskAction={createRisk}
      updateRiskAction={updateRisk}
    />
  );
}
