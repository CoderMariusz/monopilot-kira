/**
 * @vitest-environment jsdom
 *
 * ProjectStepper — NPD project workbench 8-stage OPERATIONAL rail.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-20,130-142
 *   (StageRail numbered circles + wizard step-bar connector/active-label).
 *
 * Asserts the parity checklist: 8 stages render as locale-prefixed next/link
 * navigation to the per-stage routes; done/active is driven by the project's REAL
 * current_stage (mig 242) — earlier stages ✓ done, current active, later future;
 * the CURRENTLY VIEWED route segment additionally carries aria-current="page"; the
 * bare project index without a current_stage highlights nothing; i18n labels resolve.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectStepper, PROJECT_STAGES } from '../project-stepper';

const LABELS = {
  brief: 'Brief',
  recipe: 'Recipe',
  packaging: 'Packaging',
  costing_nutrition: 'Costing & Nutrition',
  trial: 'Trial',
  sensory: 'Sensory',
  pilot: 'Pilot',
  approval: 'Approval',
  handoff: 'Handoff',
} as const;

const STAGE_ROUTE: Record<string, string> = {
  brief: 'brief',
  recipe: 'formulation',
  packaging: 'packaging',
  costing_nutrition: 'costing-nutrition',
  trial: 'trial',
  sensory: 'sensory',
  pilot: 'pilot',
  approval: 'approval',
  handoff: 'handoff',
};

function renderStepper(args: { pathname: string; currentStageKey?: string | null }) {
  return render(
    <ProjectStepper
      projectId="p1"
      locale="en"
      labels={LABELS}
      ariaLabel="Project stages"
      currentStageKey={args.currentStageKey}
      pathnameOverride={args.pathname}
    />,
  );
}

afterEach(cleanup);

describe('ProjectStepper (project.jsx:4-20,130-142)', () => {
  it('renders all 9 stages as locale-prefixed links to the per-stage routes', () => {
    renderStepper({ pathname: '/en/pipeline/p1/formulation', currentStageKey: 'recipe' });

    const nav = screen.getByTestId('project-stepper');
    expect(nav).toHaveAttribute('aria-label', 'Project stages');

    for (const stage of PROJECT_STAGES) {
      const link = screen.getByTestId(`project-step-link-${stage.key}`);
      expect(link).toHaveAttribute('href', `/en/pipeline/p1/${STAGE_ROUTE[stage.key]}`);
      expect(link).toHaveTextContent(LABELS[stage.key]);
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(9);
  });

  it('drives done/active from the project current_stage — earlier ✓ done, current active, later future', () => {
    // Project is at "trial" (index 4); route happens to be the index.
    renderStepper({ pathname: '/en/pipeline/p1', currentStageKey: 'trial' });

    const active = screen.getByTestId('project-step-trial');
    expect(active).toHaveAttribute('data-status', 'active');
    expect(within(active).getByText('5')).toBeInTheDocument();

    for (const key of ['brief', 'recipe', 'packaging', 'costing_nutrition']) {
      expect(screen.getByTestId(`project-step-${key}`)).toHaveAttribute('data-status', 'done');
    }
    for (const key of ['sensory', 'pilot', 'approval', 'handoff']) {
      expect(screen.getByTestId(`project-step-${key}`)).toHaveAttribute('data-status', 'future');
    }
  });

  it('marks the currently VIEWED route segment with aria-current="page" (even ahead of current_stage)', () => {
    // Project is at "brief" but the user navigated ahead to /sensory.
    renderStepper({ pathname: '/en/pipeline/p1/sensory', currentStageKey: 'brief' });

    const viewed = screen.getByTestId('project-step-sensory');
    expect(viewed).toHaveAttribute('data-viewed', 'true');
    expect(viewed).toHaveAttribute('aria-current', 'page');

    // current_stage=brief still drives the styling: brief is active, the rest future.
    expect(screen.getByTestId('project-step-brief')).toHaveAttribute('data-status', 'active');
  });

  it('falls back to the viewed route segment when current_stage is absent', () => {
    renderStepper({ pathname: '/en/pipeline/p1/approval' }); // index 7, no current_stage

    expect(screen.getByTestId('project-step-link-recipe')).toHaveAttribute(
      'href',
      '/en/pipeline/p1/formulation',
    );
    expect(screen.getByTestId('project-step-approval')).toHaveAttribute('data-status', 'active');
    expect(screen.getByTestId('project-step-approval')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('project-step-handoff')).toHaveAttribute('data-status', 'future');
  });

  it('bare project index with no current_stage highlights nothing — all future, no ✓', () => {
    renderStepper({ pathname: '/en/pipeline/p1' });

    for (const stage of PROJECT_STAGES) {
      const step = screen.getByTestId(`project-step-${stage.key}`);
      expect(step).toHaveAttribute('data-status', 'future');
      expect(step).not.toHaveAttribute('aria-current');
    }
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('respects a non-default locale in the hrefs', () => {
    render(
      <ProjectStepper
        projectId="abc"
        locale="pl"
        labels={LABELS}
        ariaLabel="Etapy projektu"
        currentStageKey="sensory"
        pathnameOverride="/pl/pipeline/abc/sensory"
      />,
    );
    expect(screen.getByTestId('project-step-link-brief')).toHaveAttribute(
      'href',
      '/pl/pipeline/abc/brief',
    );
    expect(screen.getByTestId('project-step-sensory')).toHaveAttribute('data-status', 'active');
  });
});
