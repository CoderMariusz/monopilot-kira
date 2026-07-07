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
import { cloneProject } from '../../../../../(npd)/pipeline/_actions/clone-project';
import { listProjects } from '../../../../../(npd)/pipeline/_actions/list-projects';
import {
  PROJECT_CREATE_PERMISSION,
  hasPermission,
  type OrgContextLike,
} from '../../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { listActiveProductCategories } from '../../../../../../actions/reference/product-categories/list';
import {
  CreateProjectWizard,
  type WizardCloneAction,
  type WizardCloneSource,
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
  fieldPacksPerCase: 'Packs per case',
  fieldPacksPerCasePlaceholder: 'e.g. 12',
  fieldOutputUnit: 'Output unit',
  fieldOutputUnitKg: 'kg',
  fieldOutputUnitPieces: 'pieces',
  fieldOutputUnitBoxes: 'boxes',
  fieldWeeklyVolumePacks: 'Weekly volume (packs/week)',
  fieldWeeklyVolumePacksPlaceholder: 'e.g. 5000',
  fieldRunsPerWeek: 'Runs per week (estimate)',
  fieldRunsPerWeekPlaceholder: 'e.g. 3',
  fieldRunsPerWeekHelp:
    'Planning estimate only — revise later on the project brief as volumes firm up.',
  fieldSalesChannel: 'Sales channel',
  briefTitle: 'Brief',
  fieldRetailPrice: 'Target retail price (GBP)',
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
  startCloneTitle: 'Clone existing project',
  startCloneDesc: 'Copy an existing project header and checklist into a fresh draft, then modify.',
  startTemplateTitle: 'Category template',
  startTemplateDesc: 'Pre-filled skeleton for a category with typical ingredients.',
  startUnavailableHint: 'Not available yet',
  cloneNoSourceHint: 'No project to clone yet',
  cloneSourceLabel: 'Project to clone',
  cloneSourcePlaceholder: 'Select a source project…',
  cloneAlert:
    'A new project will be created copying the chosen project’s header and checklist items. It starts at G0 / Brief and you can edit every value after creation.',
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
  reviewStartClone: 'Clone of an existing project',
  reviewStartTemplate: 'Category template',
  empty: '—',
  cancel: 'Cancel',
  back: 'Back',
  continue: 'Continue',
  create: 'Create project & open recipe',
  creating: 'Creating…',
  errorGeneric: 'Could not create the project. Try again.',
  errorForbidden: 'You do not have permission to create projects.',
  errorBoxesOutputUnit:
    'Output unit "boxes" requires pack weight (g) and packs per case greater than 0.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof WizardLabels>;

async function buildLabels(locale: string): Promise<WizardLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.projectWizard' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const value = t(key);
        const fallback = DEFAULT_LABELS[key];
        labels[key] =
          !value || value === key || value.includes('npd.projectWizard') ? fallback : value;
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

/**
 * Clone-project Server Action adapter (the wizard's "Clone existing project" path).
 * RBAC is enforced inside cloneProject AND the page injects it only when canCreate.
 */
const cloneProjectAdapter: WizardCloneAction = async (input) => {
  'use server';
  const result = await cloneProject(input);
  if (result.ok) {
    return { ok: true, data: { id: result.data.id, code: result.data.code } };
  }
  return { ok: false, error: result.error };
};

/** Org-scoped source projects for the clone picker (view-gated inside listProjects). */
async function loadCloneSources(): Promise<WizardCloneSource[]> {
  try {
    const result = await listProjects({});
    if (!result.ok) return [];
    return result.data.projects.map((p) => ({ id: p.id, code: p.code, name: p.name }));
  } catch (error) {
    console.error('[pipeline/new] clone-source load failed:', error);
    return [];
  }
}

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

async function loadCategoryOptions() {
  try {
    const result = await listActiveProductCategories();
    if (!result.ok) return [];
    // npd_projects.type stores the human label (legacy hardcoded values were labels).
    return result.data.map((row) => ({ value: row.label, label: row.label }));
  } catch {
    return [];
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
  // Clone sources are loaded only when the user may create — the Clone card stays
  // disabled (no sources) when forbidden, so we never query needlessly.
  const cloneSources = canCreate ? await loadCloneSources() : [];
  const categoryOptions = await loadCategoryOptions();

  return (
    <CreateProjectWizard
      locale={locale}
      labels={labels}
      createAction={canCreate ? createProjectAdapter : undefined}
      cloneAction={canCreate ? cloneProjectAdapter : undefined}
      cloneSources={cloneSources}
      categoryOptions={categoryOptions}
    />
  );
}
