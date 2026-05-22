/**
 * @vitest-environment jsdom
 * UI-127 RED — foundation shell design-token contract.
 *
 * The test compiles apps/web/app/globals.css through Tailwind v4, then mounts
 * fixture elements that use the public utility classes. JSDOM does not reliably
 * apply cascade layers or resolve Tailwind custom-property aliases, so the test
 * injects unlayered copies of the compiled shell declarations/rules. Missing
 * production tokens or utilities still fail loudly because nothing is injected.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

type TokenExpectation = {
  name: string;
  expected: string;
  aliases?: string[];
};

type UtilityExpectation = {
  testId: string;
  className: string;
  cssProperty: keyof CSSStyleDeclaration;
  expected: string;
  normalize?: (value: string) => string;
};

const shellTokens: TokenExpectation[] = [
  { name: '--shell-sidebar-w', expected: '280px', aliases: ['--spacing-sidebar'] },
  { name: '--shell-subnav-w', expected: '240px', aliases: ['--spacing-subnav'] },
  { name: '--shell-topbar-h', expected: '56px', aliases: ['--spacing-topbar'] },
  { name: '--shell-scanner-w', expected: '390px', aliases: ['--spacing-scanner'] },
  { name: '--shell-scanner-h', expected: '844px', aliases: ['--spacing-scanner-h'] },
  { name: '--shell-bg', expected: '#f8fafc', aliases: ['--color-shell-bg'] },
  { name: '--shell-fg', expected: '#1e293b', aliases: ['--color-shell-fg'] },
  { name: '--shell-border', expected: '#e2e8f0', aliases: ['--color-shell-border'] },
  { name: '--shell-muted', expected: '#64748b', aliases: ['--color-shell-muted'] },
  { name: '--shell-active', expected: '#dbeafe', aliases: ['--color-shell-active'] },
  { name: '--shell-active-fg', expected: '#1e40af', aliases: ['--color-shell-active-fg'] },
  { name: '--shell-badge-blue', expected: '#dbeafe', aliases: ['--color-shell-badge-blue'] },
];

const toRgb = (value: string) => {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb;
};

const shellUtilities: UtilityExpectation[] = [
  { testId: 'sidebar', className: 'w-sidebar', cssProperty: 'width', expected: '280px' },
  { testId: 'subnav', className: 'w-subnav', cssProperty: 'width', expected: '240px' },
  { testId: 'topbar', className: 'h-topbar', cssProperty: 'height', expected: '56px' },
  { testId: 'scanner-width', className: 'w-scanner', cssProperty: 'width', expected: '390px' },
  { testId: 'scanner-height', className: 'h-scanner', cssProperty: 'height', expected: '844px' },
  { testId: 'shell-bg', className: 'bg-shell-bg', cssProperty: 'backgroundColor', expected: '#f8fafc', normalize: toRgb },
  { testId: 'shell-fg', className: 'text-shell-fg', cssProperty: 'color', expected: '#1e293b', normalize: toRgb },
  { testId: 'shell-muted', className: 'text-shell-muted', cssProperty: 'color', expected: '#64748b', normalize: toRgb },
  {
    testId: 'shell-border',
    className: 'border-shell-border',
    cssProperty: 'borderTopColor',
    expected: '#e2e8f0',
    normalize: toRgb,
  },
  { testId: 'shell-active', className: 'bg-shell-active', cssProperty: 'backgroundColor', expected: '#dbeafe', normalize: toRgb },
  { testId: 'shell-active-fg', className: 'text-shell-active-fg', cssProperty: 'color', expected: '#1e40af', normalize: toRgb },
  {
    testId: 'shell-badge-blue',
    className: 'bg-shell-badge-blue',
    cssProperty: 'backgroundColor',
    expected: '#dbeafe',
    normalize: toRgb,
  },
];

let compiledGlobalsCss = '';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declarationValue(css: string, customProperty: string) {
  const match = new RegExp(`${escapeRegExp(customProperty)}\\s*:\\s*([^;]+);`).exec(css);
  return match?.[1]?.trim() ?? null;
}

function compiledClassDeclarations(css: string, className: string) {
  const match = new RegExp(`\\.${escapeRegExp(className)}\\s*\\{([^}]+)\\}`, 'm').exec(css);
  return match?.[1]?.trim() ?? null;
}

function resolveShellAliases(declarations: string) {
  let resolved = declarations;
  for (const token of shellTokens) {
    for (const customProperty of [token.name, ...(token.aliases ?? [])]) {
      resolved = resolved.replaceAll(`var(${customProperty})`, token.expected);
    }
  }
  return resolved;
}

async function compileGlobalsCss() {
  const globalsPath = path.resolve(process.cwd(), 'app/globals.css');
  const sourceCss = await readFile(globalsPath, 'utf8');
  const result = await postcss([tailwindcss()]).process(sourceCss, { from: globalsPath });
  return result.css;
}

function injectCompiledShellRules(css: string) {
  const rootDeclarations = shellTokens
    .map((token) => {
      const value = declarationValue(css, token.name);
      return value ? `${token.name}: ${value};` : null;
    })
    .filter(Boolean)
    .join('\n');

  const utilityRules = shellUtilities
    .map((utility) => {
      const declarations = compiledClassDeclarations(css, utility.className);
      return declarations ? `.${utility.className} { ${resolveShellAliases(declarations)} }` : null;
    })
    .filter(Boolean)
    .join('\n');

  const style = document.createElement('style');
  style.setAttribute('data-shell-token-test-style', 'true');
  style.textContent = `:root {\n${rootDeclarations}\n}\n${utilityRules}`;
  document.head.appendChild(style);
}

beforeAll(async () => {
  compiledGlobalsCss = await compileGlobalsCss();
  injectCompiledShellRules(compiledGlobalsCss);
});

describe('UI-127 shell token CSS variables', () => {
  it('declares prototype-derived shell dimensions and palette on :root', () => {
    const rootStyle = getComputedStyle(document.documentElement);

    for (const token of shellTokens) {
      expect(rootStyle.getPropertyValue(token.name).trim(), `${token.name} should be declared in globals.css`).toBe(
        token.expected,
      );
    }
  });
});

describe('UI-127 Tailwind shell utility contract', () => {
  it('compiles the public shell utility classes from globals.css', () => {
    for (const utility of shellUtilities) {
      expect(compiledClassDeclarations(compiledGlobalsCss, utility.className), `${utility.className} must be generated`).toBeTruthy();
    }
  });

  it('mounts each shell utility and resolves computed px/colour values', () => {
    render(
      <div>
        <div data-shell-token-fixture="sidebar" data-testid="sidebar" className="w-sidebar" />
        <div data-shell-token-fixture="subnav" data-testid="subnav" className="w-subnav" />
        <div data-shell-token-fixture="topbar" data-testid="topbar" className="h-topbar" />
        <div data-testid="scanner-width" className="w-scanner" />
        <div data-testid="scanner-height" className="h-scanner" />
        <div data-testid="shell-bg" className="bg-shell-bg" />
        <div data-testid="shell-fg" className="text-shell-fg" />
        <div data-testid="shell-muted" className="text-shell-muted" />
        <div data-testid="shell-border" className="border-shell-border" style={{ borderStyle: 'solid', borderWidth: 1 }} />
        <div data-testid="shell-active" className="bg-shell-active" />
        <div data-testid="shell-active-fg" className="text-shell-active-fg" />
        <div data-testid="shell-badge-blue" className="bg-shell-badge-blue" />
      </div>,
    );

    for (const utility of shellUtilities) {
      const computed = getComputedStyle(screen.getByTestId(utility.testId));
      const actual = String(computed[utility.cssProperty]);
      expect(actual, `${utility.className} should set ${String(utility.cssProperty)}`).toBe(
        utility.normalize ? utility.normalize(utility.expected) : utility.expected,
      );
    }
  });
});
