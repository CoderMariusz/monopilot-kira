/**
 * @vitest-environment jsdom
 * T-128 / SET-034 — Schema Shadow Preview screen
 * RED phase: these tests specify the production screen behavior before the
 * page exists. The dynamic loader intentionally converts a missing page module
 * into an empty component so Vitest reports behavior assertion failures instead
 * of a module-resolution error during RED.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPublishDeptColumnDraft = vi.fn();
const mockUpsertDeptColumnDraft = vi.fn();

vi.mock('../../../../(settings)/schema/_actions/draft', () => ({
  publishDeptColumnDraft: mockPublishDeptColumnDraft,
  upsertDeptColumnDraft: mockUpsertDeptColumnDraft,
}));

type PreviewPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

type PreviewPage = (props: PreviewPageProps) => React.ReactNode | Promise<React.ReactNode>;

async function loadPreviewPage(): Promise<PreviewPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    return mod.default as PreviewPage;
  } catch {
    return function MissingSchemaShadowPreviewPage() {
      return React.createElement('main', { 'data-testid': 'missing-schema-shadow-preview-page' });
    };
  }
}

async function renderPreview(searchParams: Record<string, string | undefined> = {}) {
  const Page = await loadPreviewPage();
  const node = await Page({ searchParams: Promise.resolve(searchParams) });
  return render(React.createElement(React.Fragment, null, node));
}

describe('SET-034 Schema Shadow Preview split layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the UX SET-034 split layout with draft selector, sample form panel, and preview-only notice', async () => {
    await renderPreview();

    expect(
      screen.getByRole('heading', { name: /schema shadow preview/i }),
    ).toBeInTheDocument();

    const splitLayout = screen.getByTestId('schema-shadow-preview-split-layout');
    const draftPanel = within(splitLayout).getByRole('region', { name: /draft column selector/i });
    const formPanel = within(splitLayout).getByRole('region', { name: /rendered sample form/i });

    expect(draftPanel).toHaveAttribute('data-width', '40%');
    expect(formPanel).toHaveAttribute('data-width', '60%');
    expect(within(draftPanel).getByRole('combobox', { name: /draft column/i })).toBeInTheDocument();
    expect(within(formPanel).getByRole('form', { name: /sample data/i })).toBeInTheDocument();

    expect(screen.getByRole('alert')).toHaveTextContent(
      /this is a preview only\. no data is saved\./i,
    );
  });

  it('selecting a draft column renders generated runtime schema and sample data without production writes', async () => {
    const user = userEvent.setup();
    await renderPreview({ draftId: 'draft-allergen-risk' });

    await user.selectOptions(
      screen.getByRole('combobox', { name: /draft column/i }),
      'draft-allergen-risk',
    );

    const sampleForm = screen.getByRole('form', { name: /sample data/i });
    expect(within(sampleForm).getByLabelText(/allergen risk score/i)).toHaveDisplayValue('42');
    expect(screen.getByTestId('generated-runtime-schema')).toHaveTextContent(
      /allergen_risk_score.*z\.number\(\).*min\(1\).*max\(100\)/is,
    );

    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('Publish this Column hands off to the existing publish action for the selected draft', async () => {
    const user = userEvent.setup();
    mockPublishDeptColumnDraft.mockResolvedValue({
      success: true,
      deptColumnId: 'dept-col-allergen-risk',
      newSchemaVersion: 8,
      idempotent: false,
    });

    await renderPreview({ draftId: 'draft-allergen-risk' });

    await user.click(screen.getByRole('button', { name: /publish this column/i }));

    await waitFor(() => {
      expect(mockPublishDeptColumnDraft).toHaveBeenCalledTimes(1);
      expect(mockPublishDeptColumnDraft).toHaveBeenCalledWith('draft-allergen-risk');
    });
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/schema version 8/i);
  });

  it('surfaces concurrent-edit publish rejection and does not fall back to an ad-hoc write path', async () => {
    const user = userEvent.setup();
    mockPublishDeptColumnDraft.mockResolvedValue({
      success: false,
      code: 'CONCURRENT_SCHEMA_VERSION',
      message: 'Schema changed from version 7 to 8 before publish.',
      currentSchemaVersion: 8,
      attemptedSchemaVersion: 7,
    });

    await renderPreview({ draftId: 'draft-allergen-risk' });

    await user.click(screen.getByRole('button', { name: /publish this column/i }));

    const conflict = await screen.findByRole('alert');
    expect(conflict).toHaveTextContent(/concurrent edit/i);
    expect(conflict).toHaveTextContent(/version 7/i);
    expect(conflict).toHaveTextContent(/version 8/i);
    expect(mockPublishDeptColumnDraft).toHaveBeenCalledTimes(1);
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
  });
});

describe('SET-034 non-mutating states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading skeleton without publish or write controls', async () => {
    await renderPreview({ state: 'loading' });

    expect(screen.getByTestId('schema-shadow-preview-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('renders the no-draft state without production mutations', async () => {
    await renderPreview({ state: 'no-drafts' });

    expect(screen.getByRole('status')).toHaveTextContent(/no draft columns/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('renders permission-denied as read-only and non-mutating', async () => {
    await renderPreview({ state: 'permission-denied' });

    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('renders schema-generation errors without saving, publishing, or hiding the preview-only notice', async () => {
    await renderPreview({ state: 'schema-generation-error', draftId: 'draft-bad-formula' });

    expect(screen.getByRole('alert', { name: /schema generation error/i })).toHaveTextContent(
      /could not generate runtime schema/i,
    );
    expect(screen.getByText(/this is a preview only\. no data is saved\./i)).toBeInTheDocument();
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });
});
