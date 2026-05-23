/**
 * @vitest-environment jsdom
 * UI-130 RED — SiteCrumb static orgName host for future multi-site switcher.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

type SiteCrumbProps = {
  orgName: string;
};

type SiteCrumbComponent = React.ComponentType<SiteCrumbProps>;

const siteCrumbPath = path.resolve(process.cwd(), 'components/shell/site-crumb.tsx');

async function loadSiteCrumb(): Promise<SiteCrumbComponent> {
  expect(
    existsSync(siteCrumbPath),
    'SiteCrumb production component must exist at apps/web/components/shell/site-crumb.tsx',
  ).toBe(true);

  const mod = (await import(/* @vite-ignore */ siteCrumbPath)) as { SiteCrumb?: SiteCrumbComponent; default?: SiteCrumbComponent };
  const SiteCrumb = mod.SiteCrumb ?? mod.default;
  if (typeof SiteCrumb !== 'function') {
    expect.fail('site-crumb.tsx must export SiteCrumb or a default React component');
  }
  return SiteCrumb;
}

afterEach(() => cleanup());

describe('UI-130 SiteCrumb', () => {
  it('renders orgName as static text in the future site-switcher slot with the required TODO marker', async () => {
    const SiteCrumb = await loadSiteCrumb();
    render(<SiteCrumb orgName="Apex Dairy" />);

    const crumb = screen.getByTestId('app-topbar-sitecrumb');
    expect(crumb).toHaveAttribute('data-slot', 'site-switcher');
    expect(crumb).toHaveAttribute('data-todo', 'multi-site-T-020');
    expect(crumb).toHaveTextContent(/^Apex Dairy$/);
    expect(crumb.textContent?.trim()).toBe('Apex Dairy');

    expect(within(crumb).queryByRole('button'), 'SiteCrumb must not implement live site switching yet').not.toBeInTheDocument();
    expect(within(crumb).queryByRole('combobox'), 'SiteCrumb must remain text-only; no Select/dropdown').not.toBeInTheDocument();
    expect(within(crumb).queryByRole('menu'), 'SiteCrumb must not expose a menu before 14-multi-site/T-020').not.toBeInTheDocument();
  });

  it('keeps the multi-site/T-020 TODO in the source next to the stable host marker', () => {
    expect(
      existsSync(siteCrumbPath),
      'SiteCrumb production component must exist at apps/web/components/shell/site-crumb.tsx',
    ).toBe(true);
    const source = readFileSync(siteCrumbPath, 'utf8');
    expect(source).toContain('TODO(multi-site/T-020)');
    expect(source).toContain('data-todo="multi-site-T-020"');
  });
});
