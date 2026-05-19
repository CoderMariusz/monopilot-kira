/**
 * T-127 — Authorization Policies screen (SET-011b)
 *
 * RED phase: these RTL tests specify the Settings Authorization Policies screen.
 * They must fail until apps/web/app/(admin)/settings/authorization/page.tsx is implemented.
 *
 * Source of truth: UX SET-011b from docs/prd/02-SETTINGS-PRD.md and the task packet.
 * No exact prototype exists, so assertions focus on required visible behavior and guardrails.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../actions/authorization/policy-actions', () => ({
  updateAuthorizationPolicy: vi.fn(),
}));

import { updateAuthorizationPolicy } from '../../../../actions/authorization/policy-actions';

type AuthorizationPoliciesPageProps = {
  canEdit: boolean;
  policies: PolicySummary[];
  auditLogHref: string;
  onSave?: ReturnType<typeof vi.fn>;
};

type PolicySummary = {
  policyCode: 'npd_post_release_edit' | 'technical_product_spec_approval';
  title: string;
  status: 'enabled' | 'misconfigured' | 'missing_seed';
  version: number;
  requiredPermission: string;
  authorizerRoles: string[];
  requestPermissions?: string[];
  requiresNewVersion?: boolean;
  minApprovers?: number;
  approvalGateRuleCode?: string;
  factoryUseBlockingLocked?: boolean;
  blockers?: Array<{ code: string; message: string }>;
};

const basePolicies: PolicySummary[] = [
  {
    policyCode: 'npd_post_release_edit',
    title: 'NPD post-release edit authorization',
    status: 'enabled',
    version: 3,
    requiredPermission: 'npd.post_release_edit.authorize',
    requestPermissions: ['npd.post_release_edit.request'],
    authorizerRoles: ['NPD Manager', 'QA Manager'],
    requiresNewVersion: true,
  },
  {
    policyCode: 'technical_product_spec_approval',
    title: 'Technical product-spec approval gate',
    status: 'enabled',
    version: 5,
    requiredPermission: 'technical.product_spec.approve',
    authorizerRoles: ['Technical Approver'],
    minApprovers: 1,
    approvalGateRuleCode: 'technical_product_spec_approval_gate_v1',
    factoryUseBlockingLocked: true,
  },
];

async function loadAuthorizationPoliciesPage() {
  const target = './page';
  const module = await import(/* @vite-ignore */ target).catch(() => null);
  expect(module, 'apps/web/app/(admin)/settings/authorization/page.tsx should exist for SET-011b').not.toBeNull();
  expect(module?.default, 'SET-011b page must default-export a renderable React component').toEqual(expect.any(Function));
  return module!.default as React.ComponentType<AuthorizationPoliciesPageProps>;
}

async function renderAuthorizationPolicies(overrides?: {
  canEdit?: boolean;
  policies?: PolicySummary[];
  onSave?: ReturnType<typeof vi.fn>;
  auditLogHref?: string;
}) {
  const AuthorizationPoliciesPage = await loadAuthorizationPoliciesPage();
  const onSave = overrides?.onSave ?? vi.fn().mockResolvedValue({
    ok: true,
    policies: basePolicies.map((policy) => ({ ...policy, version: policy.version + 1 })),
  });

  render(
    <AuthorizationPoliciesPage
      canEdit={overrides?.canEdit ?? true}
      policies={overrides?.policies ?? basePolicies}
      auditLogHref={overrides?.auditLogHref ?? '/settings/audit?entity=org_authorization_policies'}
      onSave={onSave}
    />,
  );

  return { onSave };
}

describe('SET-011b layout and invariant summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly two policy cards with status badges, invariant banners, and read-only policy identifiers', async () => {
    await renderAuthorizationPolicies();

    expect(screen.getByRole('heading', { name: /authorization policies/i })).toBeInTheDocument();

    const cards = screen.getAllByTestId('authorization-policy-card');
    expect(cards).toHaveLength(2);

    const npdCard = screen.getByRole('region', { name: /npd post-release edit authorization/i });
    expect(within(npdCard).getByText('npd_post_release_edit')).toBeInTheDocument();
    expect(within(npdCard).getByText(/enabled/i)).toHaveAccessibleName(/enabled/i);
    expect(within(npdCard).getByText('npd.post_release_edit.request')).toBeInTheDocument();
    expect(within(npdCard).getByText('npd.post_release_edit.authorize')).toBeInTheDocument();
    expect(within(npdCard).getByText(/requires a new released version/i)).toBeInTheDocument();
    expect(within(npdCard).getByText(/self-authorization is never allowed/i)).toBeInTheDocument();

    const technicalCard = screen.getByRole('region', { name: /technical product-spec approval gate/i });
    expect(within(technicalCard).getByText('technical_product_spec_approval')).toBeInTheDocument();
    expect(within(technicalCard).getByText(/enabled/i)).toHaveAccessibleName(/enabled/i);
    expect(within(technicalCard).getByText('technical.product_spec.approve')).toBeInTheDocument();
    expect(within(technicalCard).getByText('technical_product_spec_approval_gate_v1')).toBeInTheDocument();
    expect(within(technicalCard).getByText(/factory-use blocking is locked on/i)).toBeInTheDocument();
  });

  it('records the RTL structural fallback snapshot for SET-011b parity evidence', async () => {
    await renderAuthorizationPolicies();

    const structuralFallback = screen.getAllByTestId('authorization-policy-card').map((card) => {
      const cardRoot = card.closest('[data-slot="card"]') as HTMLElement | null;
      expect(cardRoot, 'authorization policy card should be wrapped by the Card primitive').not.toBeNull();
      return {
        region: cardRoot!.getAttribute('aria-label'),
        primitive: cardRoot!.getAttribute('data-slot'),
        statusBadge: cardRoot!.querySelector('[data-slot="badge"]')?.textContent?.trim(),
        rows: Array.from(cardRoot!.querySelectorAll('.text-sm.font-medium')).map((node) => node.textContent?.trim()),
        invariants: Array.from(cardRoot!.querySelectorAll('[data-slot="alert"] p')).map((node) => node.textContent?.trim()),
      };
    });

    expect(structuralFallback).toMatchInlineSnapshot(`
      [
        {
          "invariants": [
            "Requires a new released version for every approved post-release edit.",
            "Self-authorization is never allowed.",
          ],
          "primitive": "card",
          "region": "NPD post-release edit authorization",
          "rows": [
            "Required authorization permission",
            "Request permissions",
            "Authorizer roles",
          ],
          "statusBadge": "Enabled",
        },
        {
          "invariants": [
            "technical_product_spec_approval_gate_v1 is visible and locked against edits.",
            "Factory-use blocking is locked on.",
            "Self-authorization is never allowed.",
          ],
          "primitive": "card",
          "region": "Technical product-spec approval gate",
          "rows": [
            "Required authorization permission",
            "Authorizer roles",
            "Minimum approvers",
            "Approval gate rule",
          ],
          "statusBadge": "Enabled",
        },
      ]
    `);
  });
});

describe('SET-011b read-only permission state', () => {
  it('keeps summaries readable but hides save controls when settings.authorization.edit is missing', async () => {
    await renderAuthorizationPolicies({ canEdit: false });

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.authorization\.edit/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /npd post-release edit authorization/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /technical product-spec approval gate/i })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /authorizer roles/i })).not.toBeInTheDocument();
  });
});

describe('SET-011b missing seed and typed blocker states', () => {
  it('renders missing-seed and misconfigured blockers inline and disables saving until server blockers are resolved', async () => {
    const onSave = vi.fn();
    await renderAuthorizationPolicies({
      onSave,
      policies: [
        {
          ...basePolicies[0],
          status: 'missing_seed',
          blockers: [{ code: 'POLICY_MISSING', message: 'Seed row for npd_post_release_edit is missing.' }],
        },
        {
          ...basePolicies[1],
          status: 'misconfigured',
          minApprovers: 0,
          blockers: [
            { code: 'MIN_APPROVERS_INVALID', message: 'Technical approval requires at least one approver.' },
            { code: 'MISSING_ACTIVE_GATE_RULE', message: 'Active gate rule technical_product_spec_approval_gate_v1 is missing.' },
          ],
        },
      ],
    });

    expect(screen.getByText(/seed row for npd_post_release_edit is missing/i)).toBeInTheDocument();
    expect(screen.getByText(/technical approval requires at least one approver/i)).toBeInTheDocument();
    expect(screen.getByText(/active gate rule technical_product_spec_approval_gate_v1 is missing/i)).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('SET-011b saving, audit reason and discard', () => {
  it('requires an audit reason before save, calls the T-126 save action with policies and reason, then exposes updated versions', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({
      ok: true,
      policies: basePolicies.map((policy) => ({ ...policy, version: policy.version + 1 })),
    });
    await renderAuthorizationPolicies({ onSave });

    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.getByText(/audit reason is required/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /audit reason/i }), 'Quarterly authorization policy review');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        auditReason: 'Quarterly authorization policy review',
        policies: expect.arrayContaining([
          expect.objectContaining({ policyCode: 'npd_post_release_edit', requiresNewVersion: true }),
          expect.objectContaining({
            policyCode: 'technical_product_spec_approval',
            approvalGateRuleCode: 'technical_product_spec_approval_gate_v1',
            factoryUseBlockingLocked: true,
          }),
        ]),
      }),
    );

    expect(await screen.findByText(/version 4/i)).toBeInTheDocument();
    expect(await screen.findByText(/version 6/i)).toBeInTheDocument();
  });

  it('shows a pending save state and disables write controls while T-126 save is in flight', async () => {
    const user = userEvent.setup();
    let resolveSave!: (value: { ok: true; policies: PolicySummary[] }) => void;
    const onSave = vi.fn(
      () => new Promise<{ ok: true; policies: PolicySummary[] }>((resolve) => {
        resolveSave = resolve;
      }),
    );
    await renderAuthorizationPolicies({ onSave });

    await user.type(screen.getByRole('textbox', { name: /audit reason/i }), 'Quarterly authorization policy review');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(/saving authorization policies/i);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard/i })).toBeDisabled();

    resolveSave({ ok: true, policies: basePolicies });
    await waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled());
  });

  it('wires the editable page save flow to the T-126 updateAuthorizationPolicy action for both policy cards', async () => {
    const updatePolicy = vi.mocked(updateAuthorizationPolicy);
    updatePolicy
      .mockResolvedValueOnce({ ok: true, data: { policyCode: 'npd_post_release_edit', version: 4 } })
      .mockResolvedValueOnce({ ok: true, data: { policyCode: 'technical_product_spec_approval', version: 6 } });

    const AuthorizationPoliciesPage = await loadAuthorizationPoliciesPage();
    render(
      <AuthorizationPoliciesPage
        canEdit
        policies={basePolicies}
        auditLogHref="/settings/audit?entity=org_authorization_policies"
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /audit reason/i }), {
      target: { value: 'Quarterly authorization policy review' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(updatePolicy).toHaveBeenCalledTimes(2);
    expect(updatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        policyCode: 'npd_post_release_edit',
        auditReason: 'Quarterly authorization policy review',
        patch: expect.objectContaining({ requires_new_version: true }),
      }),
    );
    expect(updatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        policyCode: 'technical_product_spec_approval',
        auditReason: 'Quarterly authorization policy review',
        patch: expect.objectContaining({
          approval_gate_rule_code: 'technical_product_spec_approval_gate_v1',
          settings_json: expect.objectContaining({ factory_use_blocking_locked: true }),
        }),
      }),
    );
  });

  it('renders typed T-126 save blockers inline on the affected policy card and prevents repeated bypass attempts', async () => {
    const onSave = vi.fn().mockResolvedValue({
      ok: false,
      blockers: [
        {
          policyCode: 'technical_product_spec_approval',
          code: 'MIN_APPROVERS_INVALID',
          message: 'Technical approval requires at least one approver.',
        },
      ],
    });
    await renderAuthorizationPolicies({ onSave });

    fireEvent.change(screen.getByRole('textbox', { name: /audit reason/i }), {
      target: { value: 'Attempt to save invalid authorization policy' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    const technicalCard = screen.getByRole('region', { name: /technical product-spec approval gate/i });
    expect(await within(technicalCard).findByText(/MIN_APPROVERS_INVALID/i)).toBeInTheDocument();
    expect(within(technicalCard).getByText(/technical approval requires at least one approver/i)).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('discard restores the last saved policy summary and keeps the audit log link visible', async () => {
    const user = userEvent.setup();
    await renderAuthorizationPolicies();

    expect(screen.getByRole('link', { name: /view audit log/i })).toHaveAttribute(
      'href',
      '/settings/audit?entity=org_authorization_policies',
    );

    await user.click(screen.getByRole('button', { name: /discard/i }));

    expect(screen.getByText(/version 3/i)).toBeInTheDocument();
    expect(screen.getByText(/version 5/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /audit reason/i })).toHaveValue('');
  });
});
