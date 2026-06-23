import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Resolve real messages from the locale JSON so the test also proves the
// oee.andon i18n keys exist and render (no inline strings, no missing keys).
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(__dirname, `../../../../../../../i18n/${locale}.json`);
    const messages = JSON.parse(readFileSync(file, 'utf-8'));
    const ns = namespace.split('.').reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = key.split('.').reduce((acc: unknown, part: string) => {
        return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns);
      return typeof value === 'string' ? value : key;
    };
  }),
}));

import OeeAndonRoutePage from '../page';

describe('OeeAndonRoutePage (/oee/andon stub)', () => {
  it('renders the graceful ModuleStubNotice instead of 404', async () => {
    render(await OeeAndonRoutePage());

    expect(screen.getByTestId('module-landing-oee-andon')).toBeInTheDocument();
    // Localized title from oee.andon.title (resolved from the real en.json).
    expect(screen.getByRole('heading', { name: 'Andon board' })).toBeInTheDocument();
    // The shared stub notice marker — same "coming soon" component as other stubs.
    const stub = screen.getByTestId('module-stub-notice');
    expect(stub).toHaveTextContent('Coming soon');
    expect(stub).toHaveTextContent(/Andon kiosk/);
  });
});
