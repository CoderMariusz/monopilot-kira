/**
 * Legacy non-localized Settings Security route must be a redirect shim only —
 * the canonical SET-012 Security screen lives in the localized tree at
 * app/[locale]/(app)/(admin)/settings/security.
 */
import { describe, expect, it, vi } from 'vitest';

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect }));

import LegacySettingsSecurityPage from './page.js';

describe('legacy /settings/security route', () => {
  it('redirects to the localized App Router route', () => {
    expect(() => LegacySettingsSecurityPage()).toThrow('NEXT_REDIRECT:/en/settings/security');
    expect(redirect).toHaveBeenCalledWith('/en/settings/security');
  });
});
