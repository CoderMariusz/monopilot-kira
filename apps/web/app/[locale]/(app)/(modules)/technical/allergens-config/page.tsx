/**
 * T-048 — TEC-042 Manufacturing-op allergen additions + TEC-043 Contamination
 * Risk Matrix.
 *
 * Server Component at /technical/allergens-config. Loads the line × allergen
 * contamination matrix + process-allergen additions + coverage gaps via the real
 * Server Action (withOrgContext + RLS — no mocks), builds i18n labels
 * (technical.allergens.config, English fallback) and renders the client grid.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:111-159 (allergen_matrix_screen).
 */

import {
  loadAllergensConfig,
  saveRiskCell,
  removeRiskCell,
} from './_actions/load-config';
import { AllergensConfig, type AllergensConfigState } from './_components/allergens-config.client';
import { buildAllergensConfigLabels } from './_components/config-labels';

export const dynamic = 'force-dynamic';

export default async function AllergensConfigPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [data, labels] = await Promise.all([
    loadAllergensConfig(),
    buildAllergensConfigLabels(locale),
  ]);

  const state: AllergensConfigState =
    data.state === 'error' ? 'error' : data.state === 'empty' ? 'empty' : 'ready';

  return (
    <main data-screen="technical-allergens-config" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Technical · Allergens</p>
        <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </header>

      <AllergensConfig
        data={data}
        labels={labels}
        state={state}
        canEdit={data.canEdit}
        saveRiskAction={saveRiskCell}
        removeRiskAction={removeRiskCell}
      />
    </main>
  );
}
