/**
 * @vitest-environment jsdom
 * T-100 — Launched card legacy closeout pill.
 *
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:19-52
 *
 * The prototype Launched card is extended with a compact four-dot closeout pill
 * in the Trial / Pilot / Handoff / Packaging order required by §17.11.6.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LaunchedCardCloseoutPill } from '../launched-card-closeout-pill';

afterEach(() => cleanup());

describe('LaunchedCardCloseoutPill — prototype closeout extension', () => {
  it('renders the four sub-indicators in Trial / Pilot / Handoff / Packaging order with complete green dots', () => {
    const { container } = render(
      <LaunchedCardCloseoutPill
        status={{ trial: true, pilot: true, handoff: true, packaging: true }}
      />,
    );

    const pill = screen.getByTestId('launched-closeout-pill');
    expect(within(pill).getByText('Trial')).toBeInTheDocument();
    expect(within(pill).getByText('Pilot')).toBeInTheDocument();
    expect(within(pill).getByText('Handoff')).toBeInTheDocument();
    expect(within(pill).getByText('Packaging')).toBeInTheDocument();
    expect(
      Array.from(pill.querySelectorAll('[data-testid^="closeout-dot-"]')).map((node) =>
        node.getAttribute('data-testid'),
      ),
    ).toEqual(['closeout-dot-trial', 'closeout-dot-pilot', 'closeout-dot-handoff', 'closeout-dot-packaging']);
    expect(container).toMatchSnapshot();
  });

  it('renders localized chip labels when provided (no hard-coded English)', () => {
    render(
      <LaunchedCardCloseoutPill
        status={{ trial: true, pilot: true, handoff: true, packaging: true }}
        labels={{ trial: 'Próba', pilot: 'Pilotaż', handoff: 'Przekazanie', packaging: 'Opakowanie' }}
      />,
    );

    const pill = screen.getByTestId('launched-closeout-pill');
    expect(within(pill).getByText('Próba')).toBeInTheDocument();
    expect(within(pill).getByText('Pilotaż')).toBeInTheDocument();
    expect(within(pill).getByText('Przekazanie')).toBeInTheDocument();
    expect(within(pill).getByText('Opakowanie')).toBeInTheDocument();
    // The English placeholders must not leak when localized labels are supplied.
    expect(within(pill).queryByText('Trial')).not.toBeInTheDocument();
  });

  it('renders missing anchors as amber dots and surfaces the typed warning code', () => {
    render(
      <LaunchedCardCloseoutPill
        status={{
          trial: true,
          pilot: false,
          handoff: true,
          packaging: true,
          warningCode: 'PILOT_WO_NOT_LINKED',
        }}
      />,
    );

    expect(screen.getByTestId('closeout-warning-chip')).toHaveTextContent('PILOT_WO_NOT_LINKED');
    const pilot = screen.getByTestId('closeout-dot-pilot').querySelector('span[aria-hidden="true"]');
    expect(pilot).toHaveClass('bg-amber-500');
  });
});
