/**
 * @vitest-environment jsdom
 * TASK-000599 / T-134 RED — ScannerFrame device chrome contract.
 *
 * RED scope is tests-only. Production code is expected at
 * apps/web/components/shell/scanner-frame.tsx and must render the scanner device
 * frame with UI-127 scanner sizing tokens and stable slots/test IDs.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

type ScannerFrameProps = {
  children?: React.ReactNode;
  statusBar?: React.ReactNode;
  bottomActions?: React.ReactNode;
};

type ScannerFrameComponent = React.ComponentType<ScannerFrameProps>;

const scannerFramePath = path.resolve(process.cwd(), 'components/shell/scanner-frame.tsx');
const importModule = (specifier: string) => import(specifier);

async function loadScannerFrame(): Promise<ScannerFrameComponent> {
  expect(
    existsSync(scannerFramePath),
    'ScannerFrame production component must exist at apps/web/components/shell/scanner-frame.tsx',
  ).toBe(true);

  const mod = (await importModule('../scanner-frame')) as {
    ScannerFrame?: ScannerFrameComponent;
    default?: ScannerFrameComponent;
  };
  const ScannerFrame = mod.ScannerFrame ?? mod.default;

  expect(
    typeof ScannerFrame,
    'scanner-frame module must export ScannerFrame or a default renderable React component',
  ).toBe('function');

  return ScannerFrame as ScannerFrameComponent;
}

function runScannerFrameAccessibilityAudit(container: HTMLElement) {
  const violations: string[] = [];
  const root = container.querySelector('[data-testid="scanner-frame"]');
  const statusBar = container.querySelector('[data-testid="scanner-status-bar"]');
  const content = container.querySelector('[data-testid="scanner-content"]');
  const bottomActions = container.querySelector('[data-testid="scanner-bottom-actions"]');

  if (!(root instanceof HTMLElement)) {
    violations.push('scanner-frame root is missing');
  } else {
    if (root.getAttribute('role') !== 'application') {
      violations.push('scanner-frame root must be role=application like the prototype device shell');
    }
    if (root.getAttribute('aria-label') !== 'MonoPilot Scanner') {
      violations.push('scanner-frame root must expose aria-label="MonoPilot Scanner"');
    }
  }

  if (!(statusBar instanceof HTMLElement) || !statusBar.textContent?.trim()) {
    violations.push('scanner-status-bar must be present and named/non-empty');
  }
  if (!(content instanceof HTMLElement) || !content.textContent?.trim()) {
    violations.push('scanner-content must be present and contain the page content slot');
  }
  if (!(bottomActions instanceof HTMLElement) || bottomActions.querySelectorAll('button, a').length === 0) {
    violations.push('scanner-bottom-actions must be present and contain an actionable control');
  }

  return violations;
}

afterEach(() => cleanup());

describe('T-134 ScannerFrame device chrome', () => {
  it('renders prototype-derived device slots with stable data-testids and projected content/actions', async () => {
    const ScannerFrame = await loadScannerFrame();

    render(
      <ScannerFrame bottomActions={<button type="button">Confirm scan</button>}>
        <h1>Scan pallet</h1>
      </ScannerFrame>,
    );

    const root = screen.getByTestId('scanner-frame');
    expect(root, 'root must expose data-testid=scanner-frame').toBeInTheDocument();
    expect(screen.getByTestId('scanner-notch'), 'notch slot must match scanner/shell.jsx:9-14').toBeInTheDocument();
    expect(screen.getByTestId('scanner-status-bar'), 'status bar slot must match scanner/shell.jsx:17-33').toBeInTheDocument();
    expect(screen.getByTestId('scanner-content'), 'content slot must match scanner/shell.jsx:60-62').toBeInTheDocument();
    expect(
      screen.getByTestId('scanner-bottom-actions'),
      'bottom actions slot must match scanner/shell.jsx:64-66',
    ).toBeInTheDocument();

    expect(within(screen.getByTestId('scanner-content')).getByRole('heading', { name: 'Scan pallet' })).toBeVisible();
    expect(within(screen.getByTestId('scanner-bottom-actions')).getByRole('button', { name: 'Confirm scan' })).toBeVisible();
  });

  it('uses UI-127 scanner sizing tokens for the 390x844 device frame', async () => {
    const ScannerFrame = await loadScannerFrame();

    render(
      <ScannerFrame bottomActions={<button type="button">Confirm scan</button>}>
        Scanner fixture
      </ScannerFrame>,
    );

    const root = screen.getByTestId('scanner-frame');
    expect(root.className, 'root width must come from var(--shell-scanner-w) through w-scanner').toContain(
      'w-scanner',
    );
    expect(root.className, 'root height must come from var(--shell-scanner-h) through h-scanner').toContain(
      'h-scanner',
    );
    expect(root).toHaveStyle({ width: 'var(--shell-scanner-w)', height: 'var(--shell-scanner-h)' });
  });

  it('has zero scanner fixture accessibility contract violations', async () => {
    const ScannerFrame = await loadScannerFrame();

    const { container } = render(
      <ScannerFrame bottomActions={<button type="button">Confirm scan</button>}>
        <h1>Scan pallet</h1>
      </ScannerFrame>,
    );

    const violations = runScannerFrameAccessibilityAudit(container);
    expect(violations, violations.join('; ')).toEqual([]);
  });
});
