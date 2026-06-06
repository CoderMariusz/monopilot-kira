/**
 * /{locale}/pipeline/new — full-page 4-step "Create NPD project" wizard.
 *
 * Server Component shell. Resolves RBAC server-side and renders the Client wizard,
 * injecting the merged createProject Server Action ONLY when npd.project.create is
 * granted (mirrors the pipeline page + project-create-modal injection pattern — the
 * client can never create what the server would reject).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:107-263 (CreateProjectWizard)
 *
 * Data: createProject persists every brief field to public.npd_projects (mig 242),
 * org-scoped/RLS-enforced via app.current_org_id(); no mocks.
 */

import { getTranslations } from 'next-intl/server';

import { createProject } from '../../../../../(npd)/pipeline/_actions/create-project';
import {
  PROJECT_CREATE_PERMISSION,
  hasPermission,
  type OrgContextLike,
} from '../../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  CreateProjectWizard,
  type WizardCreateAction,
  type WizardLabels,
} from '../_components/create-project-wizard';

export const dynamic = 'force-dynamic';

const DEFAULT_LABELS: WizardLabels = {
  breadcrumbRoot: 'NPD',
  breadcrumbCurrent: 'New project',
  pageTitle: 'Create NPD project',
  stepBasics: 'Basics',
  stepBrief: 'Brief',
  stepStarting: 'Starting point',
  stepReview: 'Review',
  basicsTitle: 'Basics',
  fieldName: 'Product working name',
  fieldNamePlaceholder: 'e.g. Sliced Ham 200g',
  fieldCategory: 'Category',
  fieldTargetLaunch: 'Target launch date',
  fieldPackFormat: 'Pack format',
  fieldPackFormatPlaceholder: 'e.g. 200g sliced pack',
  fieldPackWeight: 'Pack weight (g)',
  fieldPackWeightPlaceholder: 'e.g. 200',
  fieldSalesChannel: 'Sales channel',
  fieldVolume: 'Expected weekly volume',
  fieldVolumePlaceholder: 'e.g. 1,200 kg/week',
  briefTitle: 'Brief',
  fieldRetailPrice: 'Target retail price (EUR)',
  fieldAudience: 'Target audience',
  fieldAudiencePlaceholder: 'e.g. Premium retail — Carrefour, Auchan PL',
  fieldClaims: 'Marketing claims',
  fieldClaimsPlaceholder: 'e.g. High protein · No phosphates · Reduced nitrite',
  fieldConstraints: 'Constraints & requirements',
  fieldConstraintsPlaceholder: 'Shelf life ≥ 28 days · Protein ≥ 18g/100g · Salt ≤ 2g/100g',
  fieldNotes: 'Notes',
  fieldNotesPlaceholder: 'Background, inspiration, competitive benchmarks…',
  startingTitle: 'Starting point',
  startingSubtitle: 'How should we bootstrap the first recipe draft?',
  startBlankTitle: 'Blank recipe',
  startBlankDesc: 'Start from scratch — build ingredients from the library.',
  startCloneTitle: 'Clone existing recipe',
  startCloneDesc: 'Fork a production recipe and modify. Suggested: Sliced Ham Standard (BOM-214).',
  startTemplateTitle: 'Category template',
  startTemplateDesc: 'Pre-filled skeleton for Meat · Cold cut with typical ingredients.',
  cloneAlert:
    'Will clone BOM-214 · Sliced Ham Standard (10 ingredients, last updated 2025-09-12). You can edit every value after creation.',
  reviewTitle: 'Review & create',
  reviewReady:
    'Ready to create the project. A new project ID will be assigned, a first recipe draft generated, and your brief saved.',
  reviewName: 'Project name',
  reviewCategory: 'Category',
  reviewTarget: 'Target launch',
  reviewPrice: 'Target price',
  reviewChannelVolume: 'Channel / volume',
  reviewClaims: 'Claims',
  reviewStarting: 'Starting point',
  reviewStartBlank: 'Blank recipe',
  reviewStartClone: 'Clone of BOM-214 Sliced Ham Standard',
  reviewStartTemplate: 'Category template: Meat · Cold cut',
  empty: '—',
  cancel: 'Cancel',
  back: 'Back',
  continue: 'Continue',
  create: 'Create project & open recipe',
  creating: 'Creating…',
  errorGeneric: 'Could not create the project. Try again.',
  errorForbidden: 'You do not have permission to create projects.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof WizardLabels>;

async function buildLabels(locale: string): Promise<WizardLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.projectWizard' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const value = t(key);
        labels[key] = value === key ? DEFAULT_LABELS[key] : value;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as WizardLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

/**
 * Create-project Server Action adapter. A `'use server'` async function (a
 * serializable Server Action reference, NOT a raw client fn) so it crosses the
 * RSC→Client boundary safely (Next16). RBAC is still enforced inside createProject
 * AND the page only injects it when `canCreate` is true.
 */
const createProjectAdapter: WizardCreateAction = async (input) => {
  'use server';
  const result = await createProject(input);
  if (result.ok) {
    return { ok: true, data: { id: result.data.id, code: result.data.code } };
  }
  return { ok: false, error: result.error };
};

async function resolveCanCreate(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx): Promise<boolean> => {
      const ctx = rawCtx as OrgContextLike;
      return hasPermission(ctx, PROJECT_CREATE_PERMISSION);
    });
  } catch (error) {
    console.error('[pipeline/new] permission check failed:', error);
    return false;
  }
}

type NewProjectPageProps = {
  params?: Promise<{ locale: string }>;
  // Test seam (mirrors pipeline/page convention): bypass DB/RBAC resolution.
  canCreate?: boolean;
};

export default async function NewProjectPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as NewProjectPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };

  const labels = await buildLabels(locale);
  const canCreate = props.canCreate ?? (await resolveCanCreate());

  return (
    <CreateProjectWizard
      locale={locale}
      labels={labels}
      createAction={canCreate ? createProjectAdapter : undefined}
    />
  );
}
