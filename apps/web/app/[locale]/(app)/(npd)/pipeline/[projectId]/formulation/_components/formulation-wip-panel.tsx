import Link from 'next/link';

import {
  FaProductionTab,
  type FaProductionTabLabels,
} from '../../../../fg/[productCode]/_components/fa-production-tab';
import { loadFormulationWipPanel } from '../../../../../../../(npd)/fa/_actions/load-formulation-wip-panel';

type FormulationWipPanelProps = {
  projectId: string;
  locale: string;
  labels: FaProductionTabLabels;
  noFgTitle: string;
  noFgBody: string;
  noFgGateLink: string;
};

export async function FormulationWipPanel({
  projectId,
  locale,
  labels,
  noFgTitle,
  noFgBody,
  noFgGateLink,
}: FormulationWipPanelProps) {
  const data = await loadFormulationWipPanel(projectId);

  if (data.state === 'no_fg_linked') {
    return (
      <section
        className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
        data-testid="formulation-wip-no-fg"
      >
        <h2 className="text-sm font-semibold text-amber-900">{noFgTitle}</h2>
        <p className="mt-1 text-sm text-amber-800">{noFgBody}</p>
        <Link
          href={`/${locale}/pipeline/${projectId}/gate`}
          className="mt-2 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800"
          data-testid="formulation-wip-gate-link"
        >
          {noFgGateLink}
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-2" data-testid="formulation-wip-panel">
      <FaProductionTab
        productCode={data.productCode}
        formulationIngredientCount={data.formulationIngredientCount}
        columns={data.columns}
        rows={data.rows}
        dropdowns={data.dropdowns}
        labels={labels}
        state="ready"
        canWrite={data.canWrite}
        projectId={data.projectId}
        productionLineId={data.productionLineId}
        productionLineOptions={data.productionLineOptions}
        ingredientQtyKgPerPack={data.ingredientQtyKgPerPack}
        onSetProductionLine={data.actions.onSetProductionLine}
        componentProcesses={data.componentProcesses}
        operationOptions={data.operationOptions}
        onAddProcess={data.actions.onAddProcess}
        onUpdateProcess={data.actions.onUpdateProcess}
        onRemoveProcess={data.actions.onRemoveProcess}
        onSaveProcessRoles={data.actions.onSaveProcessRoles}
        onGetProcessDefault={data.actions.onGetProcessDefault}
      />
    </section>
  );
}

export default FormulationWipPanel;
