/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  StaleWipDefinitionBanner,
  type StaleWipDefinitionBannerLabels,
} from '../stale-wip-definition-banner';

const labels: StaleWipDefinitionBannerLabels = {
  updatedMessage: "WIP definition '{name}' was updated to v{version}",
  acceptButton: 'Update & accept',
  accepting: 'Accepting…',
  acceptSuccess: 'WIP definition update accepted.',
  acceptSuccessBomsRegenerated: 'WIP definition accepted and production BOMs were regenerated.',
  acceptError: 'Could not accept the WIP definition update. Try again.',
  acceptForbidden: 'You do not have permission to accept WIP definition updates.',
};

const staleDefinitions = [
  {
    wipDefinitionId: 'def-a',
    name: 'Sauce base',
    version: 3,
    changesHint: 'Yield adjusted to 92%',
  },
  {
    wipDefinitionId: 'def-b',
    name: 'Filling',
    version: 2,
    changesHint: null,
  },
];

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe('StaleWipDefinitionBanner', () => {
  it('renders one amber row per stale definition with changes hint', () => {
    render(
      <StaleWipDefinitionBanner
        projectId="proj-1"
        staleDefinitions={staleDefinitions}
        canAccept
        labels={labels}
        acceptAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId('stale-wip-row-def-a')).toHaveClass('bg-amber-50');
    expect(screen.getByText("WIP definition 'Sauce base' was updated to v3")).toBeInTheDocument();
    expect(screen.getByText('Yield adjusted to 92%')).toBeInTheDocument();
    expect(screen.getByTestId('stale-wip-row-def-b')).toBeInTheDocument();
    expect(screen.queryByTestId('stale-wip-accept-def-a')).toBeInTheDocument();
  });

  it('hides accept buttons when canAccept is false', () => {
    render(
      <StaleWipDefinitionBanner
        projectId="proj-1"
        staleDefinitions={staleDefinitions}
        canAccept={false}
        labels={labels}
        acceptAction={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('stale-wip-accept-def-a')).not.toBeInTheDocument();
  });

  it('shows neutral success copy when bomsRegenerated is absent', async () => {
    const acceptAction = vi.fn().mockResolvedValue({ ok: true, acceptedVersion: 3 });

    render(
      <StaleWipDefinitionBanner
        projectId="proj-1"
        staleDefinitions={[staleDefinitions[0]!]}
        canAccept
        labels={labels}
        acceptAction={acceptAction}
      />,
    );

    await userEvent.click(screen.getByTestId('stale-wip-accept-def-a'));

    await waitFor(() => {
      expect(acceptAction).toHaveBeenCalledWith({ wipDefinitionId: 'def-a', projectId: 'proj-1' });
      expect(screen.getByTestId('stale-wip-accept-success')).toHaveTextContent(labels.acceptSuccess);
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows regenerated copy only when bomsRegenerated is true', async () => {
    const acceptAction = vi.fn().mockResolvedValue({ ok: true, acceptedVersion: 3, bomsRegenerated: true });

    render(
      <StaleWipDefinitionBanner
        projectId="proj-1"
        staleDefinitions={[staleDefinitions[0]!]}
        canAccept
        labels={labels}
        acceptAction={acceptAction}
      />,
    );

    await userEvent.click(screen.getByTestId('stale-wip-accept-def-a'));

    await waitFor(() => {
      expect(screen.getByTestId('stale-wip-accept-success')).toHaveTextContent(
        labels.acceptSuccessBomsRegenerated,
      );
    });
  });
});
