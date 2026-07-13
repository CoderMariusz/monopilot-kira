/**
 * @vitest-environment jsdom
 *
 * C7b — NPD dashboard index redirects to the canonical pipeline list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import NpdDashboardRedirectPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NpdDashboardRedirectPage (C7b)', () => {
  it('redirects to the locale-prefixed pipeline list', async () => {
    await expect(
      NpdDashboardRedirectPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline');

    expect(redirectMock).toHaveBeenCalledWith('/en/pipeline');
  });

  it('preserves the locale in the redirect target', async () => {
    await expect(
      NpdDashboardRedirectPage({ params: Promise.resolve({ locale: 'pl' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/pl/pipeline');

    expect(redirectMock).toHaveBeenCalledWith('/pl/pipeline');
  });
});
