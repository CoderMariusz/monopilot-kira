/**
 * @vitest-environment jsdom
 *
 * Settings INDEX page (RSC) — has no standalone landing screen, so it must
 * server-side redirect to the first canonical sub-page (Company profile)
 * instead of rendering a blank page. Locale must be preserved.
 */
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

import SettingsIndexPage from './page';

beforeEach(() => {
  redirect.mockClear();
});

describe('Settings INDEX page', () => {
  it('redirects /settings to the canonical company-profile sub-page', async () => {
    await expect(
      SettingsIndexPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/settings/company');
  });

  it('preserves the active locale in the redirect target', async () => {
    await expect(
      SettingsIndexPage({ params: Promise.resolve({ locale: 'pl' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/pl/settings/company');
  });

  it('falls back to the en locale when params are absent', async () => {
    await expect(SettingsIndexPage({})).rejects.toThrow(
      'NEXT_REDIRECT:/en/settings/company',
    );
  });
});
