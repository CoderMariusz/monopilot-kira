/**
 * @vitest-environment jsdom
 * Legacy non-localized Settings Users route must not keep the T-059 scaffold UI.
 */
import { describe, expect, it, vi } from 'vitest';

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect }));

import LegacySettingsUsersPage from './page.js';

describe('legacy /settings/users route', () => {
  it('redirects to the localized App Router route', () => {
    expect(() => LegacySettingsUsersPage()).toThrow('NEXT_REDIRECT:/en/settings/users');
    expect(redirect).toHaveBeenCalledWith('/en/settings/users');
  });
});
