/**
 * NPD project workbench layout (RSC) — mounts the shared 8-step ProjectStepper
 * above the project index AND every per-stage child route.
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/*  (index + brief/formulation/
 * packaging/trial/sensory/pilot/approval/handoff).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-20,130-142
 *   (the workbench top stepper — see project-stepper.tsx for the full anchor map).
 *
 * Next 16 RSC safety: the layout resolves the projectId + locale from params and
 * the 8 step labels via getTranslations (server-side), then hands the client
 * <ProjectStepper> ONLY serializable props (strings) — no function props cross
 * the RSC→client boundary.
 *
 * i18n: labels come from the `npd.stepper` namespace; getTranslations falls back
 * to the literal key when a locale value is missing (next-intl default), so a
 * missing key surfaces visibly rather than crashing the layout.
 */

import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import {
  ProjectStepper,
  PROJECT_STAGES,
  type ProjectStageKey,
} from './_components/project-stepper';

type ProjectLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; projectId: string }>;
};

const STEP_FALLBACKS: Record<ProjectStageKey, string> = {
  brief: 'Brief',
  recipe: 'Recipe',
  packaging: 'Packaging',
  trial: 'Trial',
  sensory: 'Sensory',
  pilot: 'Pilot',
  approval: 'Approval',
  handoff: 'Handoff',
};

export default async function ProjectWorkbenchLayout({ children, params }: ProjectLayoutProps) {
  const { locale, projectId } = await params;

  const t = await getTranslations({ locale, namespace: 'npd.stepper' });
  const pick = (key: string, fallback: string) => {
    try {
      const value = t(key);
      return value === key || value === `npd.stepper.${key}` ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const labels = PROJECT_STAGES.reduce(
    (acc, stage) => {
      acc[stage.key] = pick(stage.i18nKey, STEP_FALLBACKS[stage.key]);
      return acc;
    },
    {} as Record<ProjectStageKey, string>,
  );

  const ariaLabel = pick('ariaLabel', 'Project stages');

  return (
    <div className="flex w-full flex-col">
      <ProjectStepper
        projectId={projectId}
        locale={locale}
        labels={labels}
        ariaLabel={ariaLabel}
      />
      {children}
    </div>
  );
}
