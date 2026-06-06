/**
 * @vitest-environment jsdom
 *
 * ProjectStepper — NPD project workbench 8-step top stepper.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-20,130-142
 *   (StageRail numbered circles + wizard step-bar connector/active-label).
 *
 * Asserts the parity checklist: 8 steps render as locale-prefixed next/link
 * navigation to the per-stage routes; the active step is derived from the
 * pathname with aria-current="step"; steps before active are "done", after are
 * "future"; the bare project index highlights nothing; i18n labels resolve.
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
  trial: 'trial',
  sensory: 'sensory',
  pilot: 'pilot',
  approval: 'approval',
  handoff: 'handoff',
};

function renderStepper(pathnameOverride: string) {
  return render(
    <ProjectStepper
      projectId="p1"
      locale="en"
      labels={LABELS}
      ariaLabel="Project stages"
      pathnameOverride={pathnameOverride}
    />,
  );
}

afterEach(cleanup);

describe('ProjectStepper (project.jsx:4-20,130-142)', () => {
  it('renders all 8 steps as locale-prefixed links to the per-stage routes', () => {
    renderStepper('/en/pipeline/p1/formulation');

    const nav = screen.getByTestId('project-stepper');
    expect(nav).toHaveAttribute('aria-label', 'Project stages');

    for (const stage of PROJECT_STAGES) {
      const link = screen.getByTestId(`project-step-link-${stage.key}`);
      expect(link).toHaveAttribute(
        'href',
        `/en/pipeline/p1/${STAGE_ROUTE[stage.key]}`,
      );
      expect(link).toHaveTextContent(LABELS[stage.key]);
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('marks the active step from the pathname with aria-current and styles prior steps done, later future', () => {
    renderStepper('/en/pipeline/p1/trial'); // index 3

    const active = screen.getByTestId('project-step-trial');
    expect(active).toHaveAttribute('data-status', 'active');
    expect(active).toHaveAttribute('aria-current', 'step');
    expect(within(active).getByText('4')).toBeInTheDocument();

    // Steps before active → done (show ✓).
    for (const key of ['brief', 'recipe', 'packaging']) {
      expect(screen.getByTestId(`project-step-${key}`)).toHaveAttribute('data-status', 'done');
    }
    // Steps after active → future.
    for (const key of ['sensory', 'pilot', 'approval', 'handoff']) {
      expect(screen.getByTestId(`project-step-${key}`)).toHaveAttribute('data-status', 'future');
    }
  });

  it('maps RECIPE → /formulation (route-per-stage rename) and APPROVAL active correctly', () => {
    renderStepper('/en/pipeline/p1/approval'); // index 6

    expect(screen.getByTestId('project-step-link-recipe')).toHaveAttribute(
      'href',
      '/en/pipeline/p1/formulation',
    );
    expect(screen.getByTestId('project-step-approval')).toHaveAttribute('data-status', 'active');
    expect(screen.getByTestId('project-step-handoff')).toHaveAttribute('data-status', 'future');
  });

  it('bare project index highlights nothing — no step active, all future', () => {
    renderStepper('/en/pipeline/p1');

    for (const stage of PROJECT_STAGES) {
      const step = screen.getByTestId(`project-step-${stage.key}`);
      expect(step).toHaveAttribute('data-status', 'future');
      expect(step).not.toHaveAttribute('aria-current');
    }
    // No ✓ glyph anywhere (nothing done); first step shows its number, not active styling.
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('respects a non-default locale in the hrefs', () => {
    render(
      <ProjectStepper
        projectId="abc"
        locale="pl"
        labels={LABELS}
        ariaLabel="Etapy projektu"
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
