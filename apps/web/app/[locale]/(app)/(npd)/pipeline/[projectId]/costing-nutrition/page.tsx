/**
 * NPD Costing + Nutrition merged stage page (RSC) — D5.
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/costing-nutrition
 *
 * Merges the former /costing and /nutrition sub-routes on one screen. Reuses
 * CostingScreen + NutritionScreen and their Server Actions via the shared loaders.
 */

import { CostingScreen } from '../costing/_components/costing-screen';
import { saveCostingInputs } from '../costing/_actions/save-costing-inputs';
import {
  buildCostingLabels,
  computeCostingAction,
  readCostingPageData,
} from '../costing/_lib/page-loader';
import { NutritionScreen } from '../nutrition/_components/nutrition-screen';
import {
  buildNutritionLabels,
  computeNutriScoreAction,
  readNutritionPageData,
} from '../nutrition/_lib/page-loader';
import { loadStageDeptSections } from '../../../../../../(npd)/pipeline/_actions/load-stage-dept-sections';
import {
  getCloseSectionLabel,
  getStageDeptSectionLabels,
} from '../../../../../../(npd)/pipeline/_lib/get-stage-dept-section-labels';
import { StageDeptSections } from '../../../../../../(npd)/pipeline/_components/StageDeptSections';
import { getStaleWipRefs } from '../_lib/get-stale-wip-refs';
import { buildStaleWipBannerLabels } from '../_lib/build-stale-wip-banner-labels';
import { StaleWipDefinitionBanner } from '../_components/stale-wip-definition-banner';
import { acceptWipDefinitionUpdateForProject } from '../_actions/accept-wip-definition-update-wrapper';

export const dynamic = 'force-dynamic';

type CostingNutritionPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
};

async function readStageSections(projectId: string) {
  if (!projectId) return null;
  try {
    return await loadStageDeptSections({ projectId, stage: 'costing_nutrition' });
  } catch (error) {
    console.error('[costing-nutrition] stage department sections read failed:', error);
    return null;
  }
}

export default async function CostingNutritionPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as CostingNutritionPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const [
    costingLabels,
    nutritionLabels,
    costingLoaded,
    nutritionLoaded,
    stageSections,
    closeSectionLabel,
    stageDeptLabels,
    staleWipBannerLabels,
    staleWipRefs,
  ] = await Promise.all([
    buildCostingLabels(locale),
    buildNutritionLabels(locale),
    readCostingPageData(projectId),
    readNutritionPageData(projectId),
    readStageSections(projectId),
    getCloseSectionLabel(locale),
    getStageDeptSectionLabels(locale),
    buildStaleWipBannerLabels(locale),
    getStaleWipRefs({ projectId }),
  ]);

  const permissionDenied =
    costingLoaded.state === 'permission_denied' || nutritionLoaded.state === 'permission_denied';

  return (
    <div data-testid="costing-nutrition-stage" className="space-y-2">
      <StaleWipDefinitionBanner
        projectId={projectId}
        staleDefinitions={staleWipRefs.staleDefinitions}
        canAccept={staleWipRefs.canAccept}
        labels={staleWipBannerLabels}
        acceptAction={acceptWipDefinitionUpdateForProject}
      />
      <CostingScreen
        state={permissionDenied ? 'permission_denied' : costingLoaded.state}
        data={costingLoaded.data}
        engineResult={costingLoaded.data?.engineResult ?? null}
        inputs={costingLoaded.inputs ?? costingLoaded.data?.inputs ?? null}
        labels={costingLabels}
        locale={locale}
        projectId={projectId}
        onSaveInputs={saveCostingInputs}
        canSaveInputs={costingLoaded.canCompute}
        computeAction={costingLoaded.canCompute ? computeCostingAction : undefined}
      />
      <NutritionScreen
        state={permissionDenied ? 'permission_denied' : nutritionLoaded.state}
        data={nutritionLoaded.data}
        labels={nutritionLabels}
        projectId={projectId}
        formulationVersionId={nutritionLoaded.formulationVersionId}
        defaultPortionGrams={nutritionLoaded.portionGrams}
        computeAction={nutritionLoaded.canCompute ? computeNutriScoreAction : undefined}
      />
      {stageSections ? (
        <StageDeptSections
          projectId={projectId}
          stage="costing_nutrition"
          data={stageSections}
          closeSectionLabel={closeSectionLabel}
          labels={stageDeptLabels}
        />
      ) : null}
    </div>
  );
}
