/**
 * @vitest-environment jsdom
 * W2-T2 — the legacy reference-A "Process steps" screen is retired; the route
 * must redirect to the unified Processes screen (/settings/process-defaults),
 * never render reference-A CRUD and never 404.
 */
import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import ProcessesLegacyRedirectPage from './page';

describe('/settings/processes (retired reference-A route)', () => {
  it('redirects to the unified processes screen for the request locale', async () => {
    await expect(
      ProcessesLegacyRedirectPage({ params: Promise.resolve({ locale: 'pl' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/pl/settings/process-defaults');
    expect(redirectMock).toHaveBeenCalledWith('/pl/settings/process-defaults');
  });

  it('falls back to en when no locale param is present', async () => {
    redirectMock.mockClear();
    await expect(ProcessesLegacyRedirectPage({})).rejects.toThrow(
      'NEXT_REDIRECT:/en/settings/process-defaults',
    );
    expect(redirectMock).toHaveBeenCalledWith('/en/settings/process-defaults');
  });
});
