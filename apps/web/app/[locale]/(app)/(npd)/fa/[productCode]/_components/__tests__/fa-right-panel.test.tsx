/**
 * T-137 / TASK-000290 RED: FA right panel sidebar.
 *
 * Prototype contract: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:404-452
 * RED scope: tests only. Production component is the behavior surface.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@testing-library/jest-dom/vitest';

type FaRightPanelFa = {
  code: string;
  fa_code: string;
  name: string;
  product_name: string;
  owner: string;
  last_updated: string;
  days_to_launch: number;
  built: boolean;
  status: 'Built' | 'Pending' | 'Blocked' | 'Complete';
  status_overall: 'Built' | 'Pending' | 'Blocked' | 'Complete';
};

type FaRightPanelProps = {
  fa: FaRightPanelFa;
  gateProgress: number;
  onOpenModal: (modal: 'deptClose' | 'd365Build', payload: { fa: FaRightPanelFa }) => void;
};

type FaRightPanelComponent = React.ComponentType<FaRightPanelProps>;

const componentPath = path.resolve(
  process.cwd(),
  'app/[locale]/(app)/(npd)/fa/[productCode]/_components/fa-right-panel.tsx',
);

const sampleFa: FaRightPanelFa = {
  code: 'FA7421',
  fa_code: 'FA7421',
  name: 'Smoked Almond Yoghurt',
  product_name: 'Smoked Almond Yoghurt',
  owner: 'Jane Nowak',
  last_updated: '2026-05-18',
  days_to_launch: 42,
  built: true,
  status: 'Built',
  status_overall: 'Built',
};

async function loadFaRightPanel(): Promise<FaRightPanelComponent> {
  if (!existsSync(componentPath)) {
    expect.fail(
      'FaRightPanel production component is missing at apps/web/app/(npd)/fa/[productCode]/_components/fa-right-panel.tsx; IMPL must add it before these RTL behavior tests can render.',
    );
  }

  const componentUrl = pathToFileURL(componentPath).href;
  const mod = (await import(componentUrl)) as {
    default?: FaRightPanelComponent;
    FaRightPanel?: FaRightPanelComponent;
  };
  const Component = mod.FaRightPanel ?? mod.default;
  if (!Component) {
    expect.fail('FaRightPanel must be exported as a named or default React component');
  }
  return Component;
}

async function renderPanel(overrides: Partial<FaRightPanelProps> = {}) {
  const FaRightPanel = await loadFaRightPanel();
  const onOpenModal = overrides.onOpenModal ?? vi.fn();
  render(
    <FaRightPanel
      fa={overrides.fa ?? sampleFa}
      gateProgress={overrides.gateProgress ?? 67}
      onOpenModal={onOpenModal}
    />,
  );
  return { onOpenModal };
}

function getPanel() {
  return screen.getByRole('complementary', { name: /fa right panel|right panel|validation status/i });
}

describe('AC1: FaRightPanel prototype-parity summary and gate progress', () => {
  it('renders a sticky shadcn Card sidebar with status pill, FA summary, Built badge, quick actions, and Progress bar', async () => {
    await renderPanel();

    const panel = getPanel();
    expect(panel).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:404-452');
    expect(panel.className, 'right panel must be sticky like the prototype sidebar').toMatch(/sticky/);

    const card = panel.querySelector('[data-slot="card"]');
    expect(card, 'right panel content must render inside a shadcn Card primitive').toBeInTheDocument();

    const badges = Array.from(panel.querySelectorAll('[data-slot="badge"]')) as HTMLElement[];
    expect(badges.some((badge) => /built/i.test(badge.textContent ?? '')), 'Built indicator must be a shadcn Badge').toBe(true);
    expect(badges.some((badge) => /status|built|complete/i.test(badge.textContent ?? '')), 'status pill must be a shadcn Badge').toBe(true);

    expect(within(panel).getByText('FA7421')).toBeInTheDocument();
    expect(within(panel).getByText('Smoked Almond Yoghurt')).toBeInTheDocument();
    expect(within(panel).getByText(/Jane Nowak/)).toBeInTheDocument();
    expect(within(panel).getByText(/2026-05-18/)).toBeInTheDocument();
    expect(within(panel).getByText(/42\s*days/i)).toBeInTheDocument();

    const deptClose = within(panel).getByRole('button', { name: /dept close/i });
    const d365Build = within(panel).getByRole('button', { name: /d365 build/i });
    expect(deptClose).toHaveAttribute('data-slot', 'button');
    expect(d365Build).toHaveAttribute('data-slot', 'button');

    const progress = within(panel).getByRole('progressbar', { name: /gate progress/i });
    expect(progress).toHaveAttribute('data-slot', 'progress');
    expect(progress).toHaveAttribute('aria-valuenow', '67');
  });
});

describe('AC2: Dept Close quick action', () => {
  it("invokes onOpenModal('deptClose', { fa }) when Dept Close is clicked", async () => {
    const onOpenModal = vi.fn();
    await renderPanel({ onOpenModal });

    await userEvent.click(screen.getByRole('button', { name: /dept close/i }));

    expect(onOpenModal).toHaveBeenCalledTimes(1);
    expect(onOpenModal).toHaveBeenCalledWith('deptClose', { fa: sampleFa });
  });
});

describe('AC3: D365 Build quick action', () => {
  it("invokes onOpenModal('d365Build', { fa }) when D365 Build is clicked", async () => {
    const onOpenModal = vi.fn();
    await renderPanel({ onOpenModal });

    await userEvent.click(screen.getByRole('button', { name: /d365 build/i }));

    expect(onOpenModal).toHaveBeenCalledTimes(1);
    expect(onOpenModal).toHaveBeenCalledWith('d365Build', { fa: sampleFa });
  });
});
