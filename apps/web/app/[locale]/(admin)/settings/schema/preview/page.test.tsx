/**
 * @vitest-environment jsdom
 * T-128 / SET-034 — localized Schema Shadow Preview screen.
 * RED only: specifies behavior for /{locale}/settings/schema/preview without
 * editing production code. A missing localized page is converted into an empty
 * component so RED reports behavior assertion failures instead of import errors.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPublishDeptColumnDraft = vi.fn();
const mockUpsertDeptColumnDraft = vi.fn();

vi.mock('../../../../../(settings)/schema/_actions/draft', () => ({
  publishDeptColumnDraft: mockPublishDeptColumnDraft,
  upsertDeptColumnDraft: mockUpsertDeptColumnDraft,
}));

type PreviewPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

type PreviewPage = (props: PreviewPageProps) => React.ReactNode | Promise<React.ReactNode>;

function isMissingPageModule(error: unknown) {
  return (
    error instanceof Error &&
    /Cannot find module.*schema\/preview\/page|Cannot find module.*\.\/page|Failed to resolve import .*\.\/page/.test(
      error.message,
    )
  );
}

async function loadPreviewPage(): Promise<PreviewPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    return mod.default as PreviewPage;
  } catch (error) {
    if (!isMissingPageModule(error)) {
      throw error;
    }

    return function MissingLocalizedSchemaShadowPreviewPage() {
      return React.createElement('main', {
        'aria-label': 'Missing localized Schema Shadow Preview page',
        'data-testid': 'missing-localized-schema-shadow-preview-page',
      });
    };
  }
}

async function renderPreview(searchParams: Record<string, string | undefined> = {}) {
  const Page = await loadPreviewPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });

  return render(React.createElement(React.Fragment, null, node));
}

describe('SET-034 localized Schema Shadow Preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders split layout with draft selector, rendered sample form, and preview-only notice', async () => {
    await renderPreview();

    expect(screen.getByRole('heading', { name: /schema shadow preview/i })).toBeInTheDocument();

    const splitLayout = screen.getByTestId('schema-shadow-preview-split-layout');
    const draftPanel = within(splitLayout).getByRole('region', { name: /draft column selector/i });
    const formPanel = within(splitLayout).getByRole('region', { name: /rendered sample form/i });

    expect(draftPanel).toHaveAttribute('data-width', '40%');
    expect(formPanel).toHaveAttribute('data-width', '60%');
    expect(within(draftPanel).getByRole('combobox', { name: /draft column/i })).toBeInTheDocument();
    expect(within(formPanel).getByRole('form', { name: /sample data/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/preview only/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/no data is saved/i);
  });

  it('selecting a draft renders generated runtime schema and sample data without production writes', async () => {
    const user = userEvent.setup();
    await renderPreview({ draftId: 'draft-allergen-risk' });

    await user.selectOptions(screen.getByRole('combobox', { name: /draft column/i }), 'draft-allergen-risk');

    const sampleForm = screen.getByRole('form', { name: /sample data/i });
    expect(within(sampleForm).getByLabelText(/allergen risk score/i)).toHaveDisplayValue('42');
    expect(screen.getByTestId('generated-runtime-schema')).toHaveTextContent(
      /allergen_risk_score.*z\.number\(\).*min\(1\).*max\(100\)/is,
    );
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('hands Publish this Column to the existing publish action and surfaces concurrent edits', async () => {
    const user = userEvent.setup();
    mockPublishDeptColumnDraft.mockResolvedValue({
      success: false,
      code: 'CONCURRENT_SCHEMA_VERSION',
      message: 'Schema changed before publish.',
      currentSchemaVersion: 8,
      attemptedSchemaVersion: 7,
    });

    await renderPreview({ draftId: 'draft-allergen-risk' });
    await user.click(screen.getByRole('button', { name: /publish this column/i }));

    await waitFor(() => expect(mockPublishDeptColumnDraft).toHaveBeenCalledWith('draft-allergen-risk'));
    expect(mockPublishDeptColumnDraft).toHaveBeenCalledTimes(1);
    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/concurrent edit/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/version 7/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/version 8/i);
  });

  it('renders loading, no-draft, permission-denied, and schema-generation error states as non-mutating', async () => {
    await renderPreview({ state: 'loading' });
    expect(screen.getByTestId('schema-shadow-preview-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    cleanup();

    await renderPreview({ state: 'no-drafts' });
    expect(screen.getByRole('status')).toHaveTextContent(/no draft columns/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    cleanup();

    await renderPreview({ state: 'permission-denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    cleanup();

    await renderPreview({ state: 'schema-generation-error', draftId: 'draft-bad-formula' });
    expect(screen.getByRole('alert', { name: /schema generation error/i })).toHaveTextContent(
      /could not generate runtime schema/i,
    );
    expect(screen.getByText(/preview only/i)).toHaveTextContent(/no data is saved/i);

    expect(mockUpsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mockPublishDeptColumnDraft).not.toHaveBeenCalled();
  });
});
