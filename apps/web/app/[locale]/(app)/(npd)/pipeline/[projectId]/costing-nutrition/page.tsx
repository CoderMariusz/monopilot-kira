/**
 * NPD Costing + Nutrition merged stage page (RSC) — D5.
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/costing-nutrition
 *
 * Merges the former /costing and /nutrition sub-routes on one screen. Reuses
 * CostingScreen + NutritionScreen and their Server Actions via the shared loaders.
 */

import { getTranslations } from 'next-intl/server';

import { CostingScreen } from '../costing/_components/costing-screen';
import {
  buildCostingLabels,
  computeCostingAction,
  readCostingPageData,
  saveCostingScenarioAction,
} from '../costing/_lib/page-loader';
import { NutritionScreen } from '../nutrition/_components/nutrition-screen';
import {
  buildNutritionLabels,
  computeNutriScoreAction,
  readNutritionPageData,
} from '../nutrition/_lib/page-loader';
import { loadStageDeptSections } from '../../../../../../(npd)/pipeline/_actions/load-stage-dept-sections';
import { StageDeptSections } from '../../../../../../(npd)/pipeline/_components/StageDeptSections';

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

async function getCloseSectionLabel(locale: string): Promise<string> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.stageDeptSections' });
    const value = t('closeSection');
    return value === 'closeSection' ? 'Close {dept} section' : value;
  } catch {
    return 'Close {dept} section';
  }
}

export default async function CostingNutritionPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as CostingNutritionPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const [costingLabels, nutritionLabels, costingLoaded, nutritionLoaded, stageSections, closeSectionLabel] =
    await Promise.all([
      buildCostingLabels(locale),
      buildNutritionLabels(locale),
      readCostingPageData(projectId),
      readNutritionPageData(projectId),
      readStageSections(projectId),
      getCloseSectionLabel(locale),
    ]);

  const permissionDenied =
    costingLoaded.state === 'permission_denied' || nutritionLoaded.state === 'permission_denied';

  return (
    <div data-testid="costing-nutrition-stage" className="space-y-2">
      <CostingScreen
        state={permissionDenied ? 'permission_denied' : costingLoaded.state}
        data={costingLoaded.data}
        labels={costingLabels}
        onSaveScenario={saveCostingScenarioAction}
        projectId={projectId}
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
        <StageDeptSections projectId={projectId} stage="costing_nutrition" data={stageSections} closeSectionLabel={closeSectionLabel} />
      ) : null}
    </div>
  );
}
