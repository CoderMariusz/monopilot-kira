import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
};

type PageHeaderComponent = React.ComponentType<PageHeaderProps>;

const packageRoot = process.cwd();
const pageHeaderPath = path.resolve(packageRoot, 'src/PageHeader.tsx');
const packageJsonPath = path.resolve(packageRoot, 'package.json');
const indexPath = path.resolve(packageRoot, 'src/index.ts');

async function loadPageHeader(): Promise<PageHeaderComponent> {
  expect(
    existsSync(pageHeaderPath),
    'PageHeader production component must exist at packages/ui/src/PageHeader.tsx',
  ).toBe(true);

  const mod = (await import(/* @vite-ignore */ pageHeaderPath)) as {
    PageHeader?: PageHeaderComponent;
    default?: PageHeaderComponent;
  };
  const PageHeader = mod.PageHeader ?? mod.default;
  if (typeof PageHeader !== 'function') {
    throw new TypeError('PageHeader.tsx must export PageHeader or a default React component');
  }
  return PageHeader;
}

async function renderPageHeader(overrides: Partial<PageHeaderProps> = {}) {
  const PageHeader = await loadPageHeader();
  return render(
    <PageHeader
      title="Settings"
      subtitle="Configure organization, data, access, and integrations."
      breadcrumb={[
        { label: 'Home', href: '/en/' },
        { label: 'Settings', href: '/en/settings' },
      ]}
      actions={<button type="button">Invite user</button>}
      {...overrides}
    />,
  );
}

describe('UI-132 PageHeader primitive', () => {
  it('is server-safe, root-importable from @monopilot/ui, and exported by the public barrel', async () => {
    expect(existsSync(pageHeaderPath), 'packages/ui/src/PageHeader.tsx must exist').toBe(true);
    const source = readFileSync(pageHeaderPath, 'utf8').trimStart();
    expect(source.startsWith('"use client"'), 'PageHeader must not be a Client Component').toBe(false);
    expect(source.startsWith("'use client'"), 'PageHeader must not be a Client Component').toBe(false);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { exports?: Record<string, unknown> };
    expect(packageJson.exports?.['.'], '@monopilot/ui root export must resolve to a barrel that exports PageHeader').toBeTruthy();
    expect(existsSync(indexPath), 'packages/ui/src/index.ts must exist for @monopilot/ui root imports').toBe(true);

    const barrel = readFileSync(indexPath, 'utf8');
    expect(barrel, 'packages/ui/src/index.ts must export PageHeader').toMatch(/PageHeader/);
    const mod = (await import(/* @vite-ignore */ indexPath)) as { PageHeader?: PageHeaderComponent };
    expect(typeof mod.PageHeader, '@monopilot/ui must expose a PageHeader named export').toBe('function');
  });

  it('renders title, subtitle, breadcrumb links, action slot, and required data-testids', async () => {
    await renderPageHeader();

    const root = screen.getByTestId('page-header');
    expect(root).toBeInTheDocument();
    expect(root).toContainElement(screen.getByTestId('page-header-title'));
    expect(screen.getByTestId('page-header-title').tagName.toLowerCase()).toBe('h1');
    expect(screen.getByTestId('page-header-title')).toHaveTextContent('Settings');
    expect(screen.getByTestId('page-header-subtitle')).toHaveTextContent('Configure organization');

    const breadcrumb = screen.getByTestId('page-header-breadcrumb');
    expect(breadcrumb.tagName.toLowerCase(), 'breadcrumb must be a nav landmark').toBe('nav');
    expect(breadcrumb).toHaveAttribute('aria-label', expect.stringMatching(/breadcrumb/i));
    expect(within(breadcrumb).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/en/');
    expect(within(breadcrumb).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/en/settings');

    const actions = screen.getByTestId('page-header-actions');
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Invite user' }));
  });

  it('omits empty optional regions and has zero axe-core violations for the rendered header', async () => {
    const { container } = await renderPageHeader({ subtitle: undefined, breadcrumb: undefined, actions: undefined });

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-title')).toHaveTextContent('Settings');
    expect(screen.queryByTestId('page-header-subtitle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('page-header-breadcrumb')).not.toBeInTheDocument();
    expect(screen.queryByTestId('page-header-actions')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations, results.violations.map((violation) => violation.id).join(', ')).toEqual([]);
  });
});
