/**
 * @vitest-environment jsdom
 * T-127 / SET-011b — Authorization Policies screen
 *
 * RED phase: page-level RTL tests for UX SET-011b. A missing production page
 * renders an empty placeholder so RED fails on behavior assertions, not import noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PolicyStatus = 'Enabled' | 'Disabled' | 'Misconfigured';
type Blocker = { code: string; policyCode: string; message: string };
type RoleOption = { code: string; label: string };

type NpdPolicy = {
  policyCode: 'npd_post_release_edit';
  enabled: boolean;
  status: PolicyStatus;
  requestPermission: 'npd.released_product_edit.request';
  authorizePermission: 'npd.released_product_edit.authorize';
  authorizedRoleCodes: string[];
  minApprovers: number;
  requireSegregationOfDuties: boolean;
  requiresNewVersion: true;
  reasonRequired: boolean;
  version: number;
  blockers: Blocker[];
};

type TechnicalPolicy = {
  policyCode: 'technical_product_spec_approval';
  required: boolean;
  status: PolicyStatus;
  approvalPermission: 'technical.product_spec.approve';
  approverRoleCodes: string[];
  minApprovers: number;
  requireDualSignOff: boolean;
  blockFactoryUseUntilApproved: true;
  approvalGateRuleCode: 'technical_product_spec_approval_gate_v1';
  version: number;
  blockers: Blocker[];
};

type UpdateAuthorizationPolicyInput = {
  policyCode: NpdPolicy['policyCode'] | TechnicalPolicy['policyCode'];
  patch: Record<string, unknown>;
  auditReason: string;
};

type AuthorizationPageProps = {
  screenState?: 'ready' | 'loading' | 'missing_seed' | 'permission_denied';
  canEditAuthorization: boolean;
  roles: RoleOption[];
  policies: {
    npd: NpdPolicy | null;
    technical: TechnicalPolicy | null;
  };
  auditLogHref: string;
  labels: Record<string, string>;
  updateAuthorizationPolicy: ReturnType<typeof vi.fn>;
};

type AuthorizationPage = (props: AuthorizationPageProps) => React.ReactNode | Promise<React.ReactNode>;

const TECHNICAL_GATE = 'technical_product_spec_approval_gate_v1';

const labels = {
  auditLink: 'View audit log →',
  auditReason: 'Audit reason',
  auditReasonRequired: 'Audit reason is required',
  auditReasonPlaceholder: 'Describe why these authorization settings are changing',
  approvalPermission: 'Approval permission',
  approvalPermissionHint: 'Fixed permission string used by the Technical gate.',
  approvalThresholds: 'Approval thresholds',
  approverRoles: 'Approver roles',
  approverRolesHint: 'Roles selected by the authorization policy row.',
  authorizePermission: 'Authorize permission',
  authorizePermissionHint: 'Fixed permission string required to approve a request.',
  authorizedRoles: 'Authorized roles',
  authorizedRolesHint: 'Roles selected by T-126 policy data.',
  blockFactoryUseUntilApproved: 'Block factory-use until approved',
  blockerApprovalPolicyDisabled: 'Approval policy is disabled',
  blockerApproverRoleMissing: 'Select at least one approver role',
  blockerAuthorizePermissionMissing: 'Authorize permission is missing',
  blockerAuthorizerRoleMissing: 'Select at least one authorized role',
  blockerGateRuleMissing: 'Technical approval gate rule is missing',
  blockerMinApproversInvalid: 'Minimum approvers must be at least 1',
  blockerMinApproversDualSignInvalid: 'Dual sign-off requires at least 2 approvers',
  blockerPolicyDisabled: 'Policy is disabled',
  blockerRequestPermissionMissing: 'Request permission is missing',
  blockerRequiresNewVersionRequired: 'requires_new_version must remain true for released-product edits',
  blockerSelfAuthorization: 'Requester and authorizer must be different users',
  blockersTitle: 'Typed blockers from T-126 preflight',
  discard: 'Discard',
  dualSignOff: 'Dual sign-off',
  dualSignOffNotRequired: 'Not required',
  dualSignOffRequired: 'Required',
  errorBody: 'Authorization policies could not be loaded. Refresh and try again.',
  errorTitle: 'Unable to load authorization policies',
  factoryUseLock: 'Factory-use lock',
  gateRuleCode: 'Gate rule code',
  gateRuleCodeHint: 'Immutable rule binding from V-SET-44.',
  invariantBanner: 'Authorized edits always create a new BOM/product-spec version; in-place mutation is never allowed. Factory-use approval remains locked until Technical signs off.',
  invariantFlags: 'Invariant flags',
  loadingLabel: 'Loading authorization policies',
  minimumApprovers: 'Minimum approvers',
  minimumAuthorizers: 'Minimum authorizers',
  minimumAuthorizersHint: 'T-126 validates blockers and segregation of duties on save.',
  missingSeedBody: 'Required org_authorization_policies rows are absent. Seed these policy codes before editing settings:',
  missingSeedTitle: 'Authorization policy seed missing',
  noRoleSelected: 'No role selected',
  npdDescription: 'Authorizes released product/BOM edit requests after NPD release.',
  npdTitle: 'NPD post-release edit authorization',
  pageSubtitle: 'Control who can request released product/BOM edits and technical approval gates.',
  pageTitle: 'Authorization Policies',
  policiesSaved: 'Policies saved.',
  policySaveError: 'Unable to save policies',
  readOnlyNotice: 'Read-only: settings.authorization.edit is required to change authorization policies.',
  requestPermission: 'Request permission',
  requestPermissionHint: 'Fixed permission string used by workflows.',
  requiresNewVersion: 'Requires new version',
  savePolicies: 'Save policies',
  saveSectionLabel: 'Save authorization policies',
  segregationOfDuties: 'Segregation of duties',
  statusDisabled: 'Disabled',
  statusEnabled: 'Enabled',
  statusMisconfigured: 'Misconfigured',
  technicalDescription: 'Blocks production/factory use until Technical approval is recorded.',
  technicalTitle: 'Technical product-spec approval gate',
  version: 'Version',
};

vi.mock('../../../../../../actions/authorization/policy-actions', () => ({
  updateAuthorizationPolicy: vi.fn().mockResolvedValue({ ok: true, data: { version: 1 } }),
}));

vi.mock('../../../../../../actions/authorization/preflight', () => ({
  NPD_POST_RELEASE_EDIT_POLICY: 'npd_post_release_edit',
  TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE: 'technical_product_spec_approval_gate_v1',
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY: 'technical_product_spec_approval',
}));

const roles: RoleOption[] = [
  { code: 'owner', label: 'Owner' },
  { code: 'admin', label: 'Admin' },
  { code: 'npd_manager', label: 'NPD Manager' },
  { code: 'quality_lead', label: 'Quality Lead' },
];

const readyPolicies: AuthorizationPageProps['policies'] = {
  npd: {
    policyCode: 'npd_post_release_edit',
    enabled: true,
    status: 'Enabled',
    requestPermission: 'npd.released_product_edit.request',
    authorizePermission: 'npd.released_product_edit.authorize',
    authorizedRoleCodes: ['owner'],
    minApprovers: 1,
    requireSegregationOfDuties: true,
    requiresNewVersion: true,
    reasonRequired: true,
    version: 7,
    blockers: [],
  },
  technical: {
    policyCode: 'technical_product_spec_approval',
    required: true,
    status: 'Enabled',
    approvalPermission: 'technical.product_spec.approve',
    approverRoleCodes: ['quality_lead'],
    minApprovers: 1,
    requireDualSignOff: true,
    blockFactoryUseUntilApproved: true,
    approvalGateRuleCode: TECHNICAL_GATE,
    version: 4,
    blockers: [],
  },
};

async function loadAuthorizationPage(): Promise<AuthorizationPage> {
  try {
    const pageModulePath = './authorization-screen.client';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-011b authorization page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as AuthorizationPage;
  } catch {
    return function MissingAuthorizationPage() {
      return React.createElement('main', { 'data-testid': 'missing-authorization-page' });
    };
  }
}

async function renderAuthorizationPage(overrides: Partial<AuthorizationPageProps> = {}) {
  const Page = await loadAuthorizationPage();
  const props: AuthorizationPageProps = {
    screenState: 'ready',
    canEditAuthorization: true,
    roles,
    policies: readyPolicies,
    auditLogHref: '/en/settings/audit?action=authorization_policy_update',
    labels,
    updateAuthorizationPolicy: vi.fn().mockResolvedValue({ ok: true, data: { version: 8 } }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<AuthorizationPageProps>, props)) };
}

function region(container: HTMLElement, selector: string): HTMLElement {
  const node = container.querySelector(selector);
  expect(node, `Expected ${selector} region to be rendered`).toBeTruthy();
  return node as HTMLElement;
}

describe('SET-011b Authorization Policies layout', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the App Router page as a Server Component and moves interactivity to the client leaf', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/authorization');
    const pageSource = await fs.readFile(path.join(dir, 'page.tsx'), 'utf8');
    const clientSource = await fs.readFile(path.join(dir, 'authorization-screen.client.tsx'), 'utf8');

    expect(pageSource.startsWith("'use client'"), 'page.tsx must not be a Client Component').toBe(false);
    expect(pageSource.startsWith('"use client"'), 'page.tsx must not be a Client Component').toBe(false);
    expect(pageSource).toContain('getTranslations');
    expect(pageSource).toContain('withOrgContext');
    expect(clientSource.startsWith('"use client"')).toBe(true);
  });

  it('renders the two policy cards with read-only permission strings, status badges, invariant banner, and audit link', async () => {
    const { container } = await renderAuthorizationPage();

    const pageHead = region(container, "section[data-region='page-head']");
    expect(within(pageHead).getByRole('heading', { name: /authorization policies/i })).toBeInTheDocument();
    expect(within(pageHead).getByText(/control who can request released product\/bom edits/i)).toBeInTheDocument();

    const npdCard = region(container, "section[data-region='npd-post-release-policy']");
    expect(within(npdCard).getByRole('heading', { name: /npd post-release edit authorization/i })).toBeInTheDocument();
    expect(within(npdCard).getByText(/enabled/i)).toBeInTheDocument();
    expect(within(npdCard).getByText('npd.released_product_edit.request')).toBeInTheDocument();
    expect(within(npdCard).getByText('npd.released_product_edit.authorize')).toBeInTheDocument();
    expect(within(npdCard).getByText(/owner/i)).toBeInTheDocument();
    expect(within(npdCard).getByText(/version 7/i)).toBeInTheDocument();

    const invariant = region(container, "div[data-region='invariant-banner']");
    expect(invariant).toHaveTextContent(/authorized edits always create a new bom\/product-spec version/i);
    expect(invariant).toHaveTextContent(/in-place mutation is never allowed/i);

    const technicalCard = region(container, "section[data-region='technical-approval-policy']");
    expect(within(technicalCard).getByRole('heading', { name: /technical product-spec approval gate/i })).toBeInTheDocument();
    expect(within(technicalCard).getByText(/enabled/i)).toBeInTheDocument();
    expect(within(technicalCard).getByText('technical.product_spec.approve')).toBeInTheDocument();
    expect(within(technicalCard).getByText(TECHNICAL_GATE)).toBeInTheDocument();
    expect(within(technicalCard).getByText(/quality lead/i)).toBeInTheDocument();
    expect(within(technicalCard).getByText(/version 4/i)).toBeInTheDocument();

    const auditLink = region(container, "a[data-region='audit-link']");
    expect(auditLink).toHaveAccessibleName(/view audit log/i);
    expect(auditLink).toHaveAttribute('href', expect.stringContaining('authorization_policy_update'));
  });

  it('shows a layout-matched loading skeleton while authorization policies are loading', async () => {
    await renderAuthorizationPage({ screenState: 'loading' });

    const busyRegion = screen.getByRole('status', { name: /loading authorization policies/i });
    expect(busyRegion).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByTestId('authorization-policy-card-skeleton')).toHaveLength(2);
  });

  it('renders a loud missing-seed state with no save controls when policy rows are absent', async () => {
    await renderAuthorizationPage({
      screenState: 'missing_seed',
      policies: { npd: null, technical: null },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/authorization policy seed missing/i);
    expect(screen.getByText(/npd_post_release_edit/i)).toBeInTheDocument();
    expect(screen.getByText(/technical_product_spec_approval/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save policies/i })).not.toBeInTheDocument();
  });

  it('keeps the summary readable and hides save controls without settings.authorization.edit', async () => {
    await renderAuthorizationPage({ canEditAuthorization: false });

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.authorization\.edit/i)).toBeInTheDocument();
    expect(screen.getByText('npd.released_product_edit.request')).toBeInTheDocument();
    expect(screen.getByText('technical.product_spec.approve')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save policies/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument();
  });

  it('shows typed misconfiguration blockers inline for the affected policy card', async () => {
    await renderAuthorizationPage({
      policies: {
        ...readyPolicies,
        npd: {
          ...readyPolicies.npd!,
          status: 'Misconfigured',
          blockers: [
            {
              code: 'requires_new_version_required',
              policyCode: 'npd_post_release_edit',
              message: 'requires_new_version must remain true for released-product edits',
            },
            {
              code: 'authorizer_role_missing',
              policyCode: 'npd_post_release_edit',
              message: 'Select at least one authorized role',
            },
          ],
        },
      },
    });

    const npdCard = screen.getByRole('region', { name: /npd post-release edit authorization/i });
    expect(within(npdCard).getByText(/misconfigured/i)).toBeInTheDocument();
    expect(within(npdCard).getByText(/requires_new_version_required/i)).toBeInTheDocument();
    expect(within(npdCard).getByText(/authorizer_role_missing/i)).toBeInTheDocument();
    expect(within(npdCard).getByText(/select at least one authorized role/i)).toBeInTheDocument();
  });
});

describe('SET-011b policy editing behavior', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('requires an audit reason, supports discard, and saves through the T-126 action contract', async () => {
    const user = userEvent.setup();
    const updateAuthorizationPolicy = vi.fn().mockResolvedValue({ ok: true, data: { policyCode: 'npd_post_release_edit', version: 8 } });
    await renderAuthorizationPage({ updateAuthorizationPolicy });

    const npdCard = screen.getByRole('region', { name: /npd post-release edit authorization/i });
    const minAuthorizers = within(npdCard).getByRole('spinbutton', { name: /minimum authorizers/i });
    fireEvent.change(minAuthorizers, { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: /discard/i }));
    expect(minAuthorizers).toHaveValue(1);

    fireEvent.change(minAuthorizers, { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: /save policies/i }));
    expect(updateAuthorizationPolicy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/audit reason is required/i);

    await user.type(screen.getByRole('textbox', { name: /audit reason/i }), 'Quarterly authorization review');
    await user.click(screen.getByRole('button', { name: /save policies/i }));

    expect(updateAuthorizationPolicy).toHaveBeenCalledWith({
      policyCode: 'npd_post_release_edit',
      auditReason: 'Quarterly authorization review',
      patch: expect.objectContaining({ min_approvers: 2 }),
    } satisfies UpdateAuthorizationPolicyInput);
  });

  it('renders server/T-126 typed blockers after save and does not show a success state when blockers exist', async () => {
    const user = userEvent.setup();
    const updateAuthorizationPolicy = vi.fn().mockResolvedValue({
      ok: false,
      error: 'policy_blocked',
      blockers: [
        {
          code: 'self_authorization',
          policyCode: 'npd_post_release_edit',
          message: 'Requester and authorizer must be different users',
        },
      ],
    });
    await renderAuthorizationPage({ updateAuthorizationPolicy });

    await user.type(screen.getByRole('textbox', { name: /audit reason/i }), 'Attempted unsafe self-authorization');
    await user.click(screen.getByRole('button', { name: /save policies/i }));

    expect(updateAuthorizationPolicy).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/self_authorization/i);
    expect(screen.getByText(/requester and authorizer must be different users/i)).toBeInTheDocument();
    expect(screen.queryByText(/policies saved/i)).not.toBeInTheDocument();
  });

  it('blocks technical dual-sign saves below two approvers with the dual-sign-specific message', async () => {
    const user = userEvent.setup();
    const updateAuthorizationPolicy = vi.fn().mockResolvedValue({ ok: true, data: { policyCode: 'npd_post_release_edit', version: 8 } });
    await renderAuthorizationPage({
      updateAuthorizationPolicy,
      policies: {
        ...readyPolicies,
        technical: {
          ...readyPolicies.technical!,
          requireDualSignOff: true,
          minApprovers: 2,
        },
      },
    });

    const technicalCard = screen.getByRole('region', { name: /technical product-spec approval gate/i });
    const minApprovers = within(technicalCard).getByRole('spinbutton', { name: /minimum approvers/i });
    fireEvent.change(minApprovers, { target: { value: '1' } });

    await user.type(screen.getByRole('textbox', { name: /audit reason/i }), 'Attempted invalid dual-sign threshold');
    await user.click(screen.getByRole('button', { name: /save policies/i }));

    expect(updateAuthorizationPolicy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/min_approvers_dual_sign_invalid/i);
    expect(screen.getByText(/dual sign-off requires at least 2 approvers/i)).toBeInTheDocument();
    expect(screen.queryByText(/minimum approvers must be at least 1/i)).not.toBeInTheDocument();
  });

  it('keeps the Technical gate rule read-only and factory-use blocking locked on', async () => {
    await renderAuthorizationPage();

    const technicalCard = screen.getByRole('region', { name: /technical product-spec approval gate/i });
    expect(within(technicalCard).getByText(TECHNICAL_GATE)).toBeInTheDocument();
    expect(within(technicalCard).queryByRole('textbox', { name: /gate rule code/i })).not.toBeInTheDocument();

    const factoryUseToggle = within(technicalCard).getByRole('checkbox', { name: /block factory-use until approved/i });
    expect(factoryUseToggle).toBeChecked();
    expect(factoryUseToggle).toBeDisabled();
  });
});
