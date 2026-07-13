/**
 * @vitest-environment jsdom
 *
 * C4 — Approval stage mounts compliance, risk-register, and allergen sections
 * in-page (keyed by productCode) and repoints C5/C6/C7 criterion links to anchors.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listDocsMock,
  listRisksMock,
  loadAllergenCascadeMock,
  evaluateApprovalCriteriaMock,
  withOrgContextMock,
  revalidatePathMock,
  uploadDocMock,
  softDeleteDocMock,
  createRiskMock,
  updateRiskMock,
} = vi.hoisted(() => ({
  listDocsMock: vi.fn(),
  listRisksMock: vi.fn(),
  loadAllergenCascadeMock: vi.fn(),
  evaluateApprovalCriteriaMock: vi.fn(),
  withOrgContextMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  uploadDocMock: vi.fn(),
  softDeleteDocMock: vi.fn(),
  createRiskMock: vi.fn(),
  updateRiskMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/approval',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: { locale?: string; namespace?: string }) => {
    const fallbacks: Record<string, Record<string, string>> = {
      'npd.approvalScreen': {
        title: 'Approval gates',
        subtitle: 'Seven approval criteria for this project',
        countPass: '{count} pass',
        countWarn: '{count} warn',
        countPending: '{count} pending',
        chainTitle: 'Approval chain',
        chainSingle: '(single approver)',
        chainMulti: '(multi-step)',
        submit: 'Submit for approval',
        submitBlocked: 'All criteria must pass before you can submit.',
        view: 'View',
        statusPass: 'Pass',
        statusWarn: 'Warning',
        statusPending: 'Pending',
        statusNotRequired: 'Not required',
        c1Name: 'Recipe locked',
        c2Name: 'Nutrition targets met',
        c3Name: 'Cost within target',
        c4Name: 'Sensory ≥ 7.0 overall',
        c5Name: 'Allergens declared',
        c6Name: 'No open high risks',
        c7Name: 'Compliance docs reviewed',
        c1Detail: 'Formulation version is locked.',
        c2Detail: 'NutriScore grade within spec.',
        c3Detail: 'Target margin meets the NPD minimum.',
        c4Detail: 'Technical sensory panel mean score.',
        c5Detail: 'All allergens audited and declared.',
        c6Detail: 'No open high-severity risks remain.',
        c7Detail: 'All compliance documents valid.',
        c1Hint: 'Lock the formulation version on the Formulation stage.',
        c2Hint: 'Compute a passing NutriScore on the Nutrition stage.',
        c3Hint: 'Reach the target-scenario margin on the Costing stage.',
        c4Hint: 'Sensory is owned by Technical — no action needed.',
        c5Hint: 'Audit and declare every allergen.',
        c6Hint: 'Close every open high-severity risk.',
        c7Hint: 'Add valid compliance documents.',
        fixLink: 'Go fix →',
        stepDone: 'Approved',
        stepCurrent: 'Awaiting',
        stepPending: 'Pending',
        approverPermissionFallback: 'Any user with npd.gate.approve can approve',
        approverNoneConfigured: 'No eligible approver is configured',
        modalTitle: 'Submit for approval',
        modalSubtitle: 'An e-signature is required to submit this gate for approval.',
        fieldPassword: 'Password',
        fieldNotes: 'Approval notes',
        cancel: 'Cancel',
        confirm: 'Confirm submission',
        signing: 'Submitting…',
        modalError: 'Submission failed. Check your password and try again.',
        loading: 'Loading approval criteria…',
        empty: 'No approval criteria yet',
        emptyBody: 'Approval criteria appear once the project reaches the approval gate.',
        error: 'Unable to load the approval criteria.',
        forbidden: 'You do not have permission to view this approval.',
      },
      'npd.compliance': { title: 'Compliance documents', upload: '+ Upload document' },
      'npd.risks': { title: 'Risk register', addRisk: '+ Add risk' },
      'npd.allergenWidget': { title: 'Allergen cascade' },
    };
    const messages = fallbacks[req?.namespace ?? ''] ?? {};
    return (key: string) => messages[key] ?? key;
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));

vi.mock('../../../../../../(npd)/pipeline/[projectId]/approval/_actions/evaluate', () => ({
  evaluateApprovalCriteria: (...args: unknown[]) => evaluateApprovalCriteriaMock(...args),
}));

vi.mock('../../../../../../(npd)/fa/[productCode]/docs/_actions/list-docs', () => ({
  listDocs: (...args: unknown[]) => listDocsMock(...args),
}));

vi.mock('../../../../../../(npd)/fa/[productCode]/docs/_actions/upload-doc', () => ({
  uploadDoc: (...args: unknown[]) => uploadDocMock(...args),
}));

vi.mock('../../../../../../(npd)/fa/[productCode]/docs/_actions/soft-delete-doc', () => ({
  softDeleteDoc: (...args: unknown[]) => softDeleteDocMock(...args),
}));

vi.mock('../../../../../../(npd)/fa/[productCode]/risks/_actions/list-risks', () => ({
  listRisks: (...args: unknown[]) => listRisksMock(...args),
}));

vi.mock('../../../../../../(npd)/fa/[productCode]/risks/_actions/create-risk', () => ({
  createRisk: (...args: unknown[]) => createRiskMock(...args),
}));

vi.mock('../../../../../../(npd)/fa/[productCode]/risks/_actions/update-risk', () => ({
  updateRisk: (...args: unknown[]) => updateRiskMock(...args),
}));

vi.mock('../../../fg/[productCode]/_lib/allergen-cascade', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../fg/[productCode]/_lib/allergen-cascade')>();
  return {
    ...actual,
    loadAllergenCascade: (...args: unknown[]) => loadAllergenCascadeMock(...args),
    buildAllergenLabels: actual.buildAllergenLabels,
    AllergenCascadeSection: ({ labels }: { labels: { title: string } }) => (
      <div data-testid="allergen-cascade-stub">{labels.title}</div>
    ),
  };
});

import ApprovalPage, { buildCriterionLinks } from './page';
import { createApprovalMountActions } from './_actions/approval-mount-actions';
import type { ApprovalScreenData } from './_components/approval-screen';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_CODE = 'FG-NPD-001';

const READY_DATA: ApprovalScreenData = {
  projectId: PROJECT_ID,
  projectCode: 'DEV-001',
  projectName: 'Sliced Ham 200g',
  gateCode: 'G4',
  approvalMode: 'single',
  criteria: {
    C1: 'pass',
    C2: 'pass',
    C3: 'pass',
    C4: 'not_required',
    C5: 'pending',
    C6: 'pending',
    C7: 'pending',
  },
  steps: [{ who: 'Approver', name: null, status: 'current', when: null }],
  eligibleApproverCount: 1,
  criterionLinks: buildCriterionLinks('en', PROJECT_ID, PRODUCT_CODE),
};

function wireOrgContext() {
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from public.npd_projects')) {
          return {
            rows: [
              {
                id: PROJECT_ID,
                code: 'DEV-001',
                name: 'Sliced Ham 200g',
                current_gate: 'G4',
                product_code: PRODUCT_CODE,
              },
            ],
          };
        }
        if (sql.includes('from public.gate_approvals')) {
          return { rows: [] };
        }
        if (sql.includes('from public.user_roles')) {
          return { rows: [{ count: '1' }] };
        }
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderPage(
  args: {
    state?: string;
    data?: ApprovalScreenData | null;
    productCode?: string | null;
    canApprove?: boolean;
    injectMountData?: boolean;
    complianceCanWrite?: boolean;
    riskCanWrite?: boolean;
  } = {},
) {
  const mountInjection = args.injectMountData
    ? {
        complianceRows: [] as const,
        riskRows: [] as const,
        allergenData: null,
        allergenState: 'empty' as const,
        complianceCanWrite: args.complianceCanWrite,
        riskCanWrite: args.riskCanWrite,
      }
    : {};

  const ui = await ApprovalPage({
    params: Promise.resolve({ locale: 'en', projectId: PROJECT_ID }),
    canApprove: false,
    ...mountInjection,
    ...args,
  });
  return render(ui as React.ReactElement);
}

beforeEach(() => {
  wireOrgContext();
  evaluateApprovalCriteriaMock.mockResolvedValue({
    ok: true,
    data: READY_DATA.criteria,
  });
  listDocsMock.mockResolvedValue({ ok: true, docs: [] });
  listRisksMock.mockResolvedValue({ ok: true, risks: [] });
  loadAllergenCascadeMock.mockResolvedValue({
    state: 'empty',
    data: null,
    canWrite: false,
    canAcceptDeclaration: false,
    displayNames: {},
  });
  uploadDocMock.mockResolvedValue({ ok: true, docId: 'doc-1' });
  softDeleteDocMock.mockResolvedValue({ ok: true, docId: 'doc-1' });
  createRiskMock.mockResolvedValue({ ok: true, riskId: 'risk-1' });
  updateRiskMock.mockResolvedValue({ ok: true, riskId: 'risk-1' });
});

afterEach(() => {
  cleanup();
  listDocsMock.mockReset();
  listRisksMock.mockReset();
  loadAllergenCascadeMock.mockReset();
  evaluateApprovalCriteriaMock.mockReset();
  withOrgContextMock.mockReset();
  revalidatePathMock.mockReset();
  uploadDocMock.mockReset();
  softDeleteDocMock.mockReset();
  createRiskMock.mockReset();
  updateRiskMock.mockReset();
});

describe('Approval page — C4 in-page compliance / risks / allergens mounts', () => {
  it('buildCriterionLinks repoints C5/C6/C7 to in-page anchors (not /fg)', () => {
    const links = buildCriterionLinks('en', PROJECT_ID, PRODUCT_CODE);
    expect(links.C5).toBe(`/en/pipeline/${PROJECT_ID}/approval#approval-allergens`);
    expect(links.C6).toBe(`/en/pipeline/${PROJECT_ID}/approval#approval-risks`);
    expect(links.C7).toBe(`/en/pipeline/${PROJECT_ID}/approval#approval-compliance`);
    expect(links.C5).not.toContain('/fg/');
    expect(links.C6).not.toContain('/fg/');
    expect(links.C7).not.toContain('/fg/');
  });

  it('renders the three mount sections with stable ids and headings when productCode is present', async () => {
    await renderPage({
      state: 'ready',
      data: READY_DATA,
      productCode: PRODUCT_CODE,
      injectMountData: true,
    });

    expect(document.getElementById('approval-compliance')).toBeInTheDocument();
    expect(document.getElementById('approval-risks')).toBeInTheDocument();
    expect(document.getElementById('approval-allergens')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Compliance documents' })).toHaveAttribute(
      'id',
      'approval-compliance-heading',
    );
    expect(screen.getByRole('heading', { name: 'Risk register' })).toHaveAttribute(
      'id',
      'approval-risks-heading',
    );
    expect(screen.getByRole('heading', { name: 'Allergen cascade' })).toHaveAttribute(
      'id',
      'approval-allergens-heading',
    );

    expect(screen.getByTestId('compliance-docs-screen')).toBeInTheDocument();
    expect(screen.getByTestId('risk-register-screen')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-cascade-stub')).toBeInTheDocument();
  });

  it('surfaces C5/C6/C7 fix links pointing to in-page anchors on the criteria card', async () => {
    await renderPage({
      state: 'ready',
      data: READY_DATA,
      productCode: PRODUCT_CODE,
      injectMountData: true,
    });

    expect(screen.getByTestId('criterion-fix-link-C5')).toHaveAttribute(
      'href',
      `/en/pipeline/${PROJECT_ID}/approval#approval-allergens`,
    );
    expect(screen.getByTestId('criterion-fix-link-C6')).toHaveAttribute(
      'href',
      `/en/pipeline/${PROJECT_ID}/approval#approval-risks`,
    );
    expect(screen.getByTestId('criterion-fix-link-C7')).toHaveAttribute(
      'href',
      `/en/pipeline/${PROJECT_ID}/approval#approval-compliance`,
    );
  });

  it('does not render mount sections when productCode is absent (pre-G3 empty state)', async () => {
    await renderPage({ state: 'empty', data: null, productCode: null });

    expect(document.getElementById('approval-compliance')).not.toBeInTheDocument();
    expect(document.getElementById('approval-risks')).not.toBeInTheDocument();
    expect(document.getElementById('approval-allergens')).not.toBeInTheDocument();
  });

  it('production path: loads mount sections via listDocs, listRisks, and loadAllergenCascade', async () => {
    await renderPage();

    expect(listDocsMock).toHaveBeenCalledWith({ productCode: PRODUCT_CODE });
    expect(listRisksMock).toHaveBeenCalledWith({ productCode: PRODUCT_CODE });
    expect(loadAllergenCascadeMock).toHaveBeenCalledWith(PRODUCT_CODE, 'en');
    expect(document.getElementById('approval-compliance')).toBeInTheDocument();
  });
});

describe('Approval page — mounted widget refresh + a11y', () => {
  it('renders the real RiskRegisterScreen add-risk affordance when riskCanWrite is true', async () => {
    await renderPage({
      state: 'ready',
      data: READY_DATA,
      productCode: PRODUCT_CODE,
      injectMountData: true,
      riskCanWrite: true,
    });

    const riskSection = screen.getByTestId('risk-register-screen');
    const cardHead = riskSection.querySelector('.card-head');
    expect(cardHead).not.toBeNull();
    expect(
      within(cardHead as HTMLElement).getByRole('button', { name: '+ Add risk' }),
    ).toBeInTheDocument();
    expect(riskSection.tagName).toBe('SECTION');
  });

  it('embedded mount sections do not add extra main landmarks beyond ApprovalScreen', async () => {
    await renderPage({
      state: 'ready',
      data: READY_DATA,
      productCode: PRODUCT_CODE,
      injectMountData: true,
      complianceCanWrite: true,
      riskCanWrite: true,
    });

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByTestId('compliance-docs-screen').tagName).toBe('SECTION');
    expect(screen.getByTestId('risk-register-screen').tagName).toBe('SECTION');
  });

  it('createRiskForApproval revalidates the approval route on success', async () => {
    createRiskMock.mockResolvedValueOnce({ ok: true, riskId: 'risk-new' });
    const { createRiskForApproval } = createApprovalMountActions('en', PROJECT_ID);

    const result = await createRiskForApproval({
      productCode: PRODUCT_CODE,
      title: 'Test risk',
      description: 'A test risk for approval refresh',
      likelihood: 2,
      impact: 2,
    });

    expect(result).toEqual({ ok: true, riskId: 'risk-new' });
    expect(createRiskMock).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith(`/en/pipeline/${PROJECT_ID}/approval`);
  });

  it('softDeleteDocForApproval does not revalidate when the underlying action fails', async () => {
    softDeleteDocMock.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    const { softDeleteDocForApproval } = createApprovalMountActions('en', PROJECT_ID);

    const result = await softDeleteDocForApproval({ productCode: PRODUCT_CODE, docId: 'doc-1' });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
