/**
 * @vitest-environment jsdom
 * T-118 / TASK-000773 RED — Quality settings GRN QC inspection toggle.
 *
 * Tests specify the visible /en/settings/quality behavior from
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:355-413.
 * Missing production modules render an empty placeholder so RED fails on behavior,
 * not on module-resolution noise.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FLAG_CODE = 'require_grn_qc_inspection';
const REQUIRED_PERMISSION = 'settings.flags.edit';
const FORBIDDEN_PERMISSION = 'settings.quality.edit';

type SaveInput = {
  flagKey: typeof FLAG_CODE;
  enabled: boolean;
  auditReason?: string;
};

type SaveResult =
  | { ok: true; data: { flagKey: typeof FLAG_CODE; enabled: boolean; auditLogAction: 'settings.flag.updated' } }
  | { ok: false; error: 'forbidden' | 'persistence_failed' | 'invalid_input' };

type RequireGrnQcToggleProps = {
  initialEnabled: boolean;
  canEdit: boolean;
  permission: typeof REQUIRED_PERMISSION;
  labels: {
    title: string;
    description: string;
    comingBanner: string;
    onLabel: string;
    offLabel: string;
    readOnly: string;
    saveSuccess: string;
  };
  setRequireGrnQcInspection: (input: SaveInput) => Promise<SaveResult>;
};

type ToggleComponent = React.ComponentType<RequireGrnQcToggleProps>;

const labels: RequireGrnQcToggleProps['labels'] = {
  title: 'Require GRN QC inspection',
  description: 'Inbound GRNs must pass Quality inspection before stock is released.',
  comingBanner: 'Quality module enforcement is coming soon; this flag only records the setting.',
  onLabel: 'Inspection required',
  offLabel: 'Inspection not required',
  readOnly: 'You need settings.flags.edit to change this flag.',
  saveSuccess: 'Quality flag saved and audit log recorded.',
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => labelsByKey[key] ?? key),
}));

const labelsByKey: Record<string, string> = {
  title: labels.title,
  description: labels.description,
  comingBanner: labels.comingBanner,
  onLabel: labels.onLabel,
  offLabel: labels.offLabel,
  readOnly: labels.readOnly,
  saveSuccess: labels.saveSuccess,
};

async function loadToggle(): Promise<ToggleComponent> {
  try {
    const componentPath = '../RequireGrnQcToggle.tsx';
    const mod = await import(/* @vite-ignore */ componentPath);
    return (mod.default ?? mod.RequireGrnQcToggle) as ToggleComponent;
  } catch {
    return function MissingRequireGrnQcToggle() {
      return React.createElement('section', { 'data-testid': 'missing-require-grn-qc-toggle' });
    };
  }
}

async function renderToggle(overrides: Partial<RequireGrnQcToggleProps> = {}) {
  const RequireGrnQcToggle = await loadToggle();
  const setRequireGrnQcInspection = vi.fn(async (input: SaveInput): Promise<SaveResult> => ({
    ok: true,
    data: { flagKey: input.flagKey, enabled: input.enabled, auditLogAction: 'settings.flag.updated' },
  }));
  const props: RequireGrnQcToggleProps = {
    initialEnabled: false,
    canEdit: true,
    permission: REQUIRED_PERMISSION,
    labels,
    setRequireGrnQcInspection,
    ...overrides,
  };

  return { props, ...render(<RequireGrnQcToggle {...props} />) };
}

describe('T-118 quality settings AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of a legacy body-only route', () => {
    const canonicalRoute = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/quality/page.tsx');
    const legacyRoute = join(process.cwd(), 'app/[locale]/(admin)/settings/quality/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'T-118 must implement /en/settings/quality under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only quality settings implementation').toBe(false);
  });
});

describe('RequireGrnQcToggle RED behavior', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders flag=false as OFF with the Quality-coming banner and design-system switch semantics', async () => {
    await renderToggle({ initialEnabled: false });

    expect(screen.getByRole('heading', { name: /require grn qc inspection/i })).toBeInTheDocument();
    expect(screen.getByText(/quality module enforcement is coming soon/i)).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: /require grn qc inspection/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAttribute('data-slot', 'switch');
    expect(screen.getByText(/inspection not required/i)).toBeInTheDocument();
  });

  it('lets users with settings.flags.edit save true and calls the action with audit-ready flag metadata', async () => {
    const user = userEvent.setup();
    const { props } = await renderToggle({ initialEnabled: false, canEdit: true, permission: REQUIRED_PERMISSION });

    await user.click(screen.getByRole('switch', { name: /require grn qc inspection/i }));

    expect(props.setRequireGrnQcInspection).toHaveBeenCalledWith({
      flagKey: FLAG_CODE,
      enabled: true,
      auditReason: expect.stringContaining('settings.flags.edit'),
    });
    expect(await screen.findByText(/audit log recorded/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /require grn qc inspection/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('renders read-only for users without settings.flags.edit and never references settings.quality.*', async () => {
    const user = userEvent.setup();
    const { props, container } = await renderToggle({ initialEnabled: false, canEdit: false, permission: REQUIRED_PERMISSION });

    const toggle = screen.getByRole('switch', { name: /require grn qc inspection/i });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/settings\.flags\.edit/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain(FORBIDDEN_PERMISSION);

    await user.click(toggle);
    expect(props.setRequireGrnQcInspection).not.toHaveBeenCalled();
  });

  it('keeps the page structure compatible with the settings flags admin prototype region', async () => {
    await renderToggle({ initialEnabled: false });

    const regionNames = Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    );
    expect(regionNames).toEqual(expect.arrayContaining(['quality-coming-banner', 'flag-toggle-card', 'flag-rbac-note']));

    const card = screen.getByTestId('require-grn-qc-card');
    expect(within(card).getByText(FLAG_CODE)).toBeInTheDocument();
    expect(within(card).getByRole('switch', { name: /require grn qc inspection/i })).toBeInTheDocument();
  });
});
