/**
 * @vitest-environment jsdom
 * T-096 / SET-053 — Reference CSV Import Wizard RED contract.
 * Source of truth: prototypes/design/02-SETTINGS-UX.md SET-053 / reference-import.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type ReferenceColumn = {
  code: string;
  label: string;
  required?: boolean;
};

type PreviewRow = {
  rowNumber: number;
  action: 'insert' | 'update' | 'skip' | 'error';
  values: Record<string, string>;
  message?: string;
};

type ImportPreview = {
  parsedRows: number;
  insertCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: PreviewRow[];
  headerMismatch?: { expected: string[]; received: string[] };
};

type CommitResult = {
  status: 'processing' | 'complete';
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorRowsDownloadHref?: string;
};

type ReferenceImportPageProps = {
  params?: Promise<{ locale: string; code: string }>;
  referenceTable?: {
    code: string;
    name: string;
    columns: ReferenceColumn[];
    parentHref: string;
  };
  initialStep?: 'upload' | 'preview' | 'commit';
  preview?: ImportPreview;
  commitResult?: CommitResult;
  parseCsv?: (file: File) => Promise<ImportPreview>;
  commitImport?: (preview: ImportPreview) => Promise<CommitResult>;
};

type ReferenceImportPage = (props: ReferenceImportPageProps) => React.ReactNode | Promise<React.ReactNode>;

const referenceTable = {
  code: 'allergens_reference',
  name: 'Allergens reference',
  columns: [
    { code: 'allergen_code', label: 'Allergen code', required: true },
    { code: 'display_name', label: 'Display name', required: true },
    { code: 'risk_level', label: 'Risk level', required: false },
    { code: 'is_enabled', label: 'Enabled', required: false },
  ],
  parentHref: '/en/settings/reference/allergens_reference',
};

const validPreview: ImportPreview = {
  parsedRows: 8,
  insertCount: 4,
  updateCount: 2,
  skipCount: 1,
  errorCount: 1,
  rows: [
    {
      rowNumber: 2,
      action: 'insert',
      values: { allergen_code: 'SESAME', display_name: 'Sesame', risk_level: 'major', is_enabled: 'true' },
    },
    {
      rowNumber: 3,
      action: 'update',
      values: { allergen_code: 'MILK', display_name: 'Milk', risk_level: 'major', is_enabled: 'true' },
    },
    {
      rowNumber: 4,
      action: 'skip',
      values: { allergen_code: 'EGG', display_name: 'Egg', risk_level: 'major', is_enabled: 'false' },
    },
    {
      rowNumber: 5,
      action: 'error',
      values: { allergen_code: '', display_name: 'Missing code', risk_level: 'major', is_enabled: 'true' },
      message: 'allergen_code is required',
    },
  ],
};

const mismatchedHeaderPreview: ImportPreview = {
  ...validPreview,
  headerMismatch: {
    expected: ['allergen_code', 'display_name', 'risk_level', 'is_enabled'],
    received: ['name', 'risk', 'enabled'],
  },
};

async function loadReferenceImportPage(): Promise<ReferenceImportPage> {
  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath).catch(() => null);
  const Page = (mod as { default?: ReferenceImportPage } | null)?.default;
  if (Page) {
    return Page;
  }

  return function MissingReferenceImportPage() {
    return React.createElement('main', { 'data-testid': 'missing-reference-csv-import-wizard-page' });
  };
}

async function renderReferenceImport(overrides: Partial<ReferenceImportPageProps> = {}) {
  const Page = await loadReferenceImportPage();
  const props: ReferenceImportPageProps = {
    params: Promise.resolve({ locale: 'en', code: 'allergens_reference' }),
    referenceTable,
    initialStep: 'upload',
    parseCsv: vi.fn().mockResolvedValue(validPreview),
    commitImport: vi.fn().mockResolvedValue({ status: 'complete', inserted: 4, updated: 2, skipped: 1, errors: 1 }),
    ...overrides,
  };

  const node = await Page(props);
  render(React.createElement(React.Fragment, null, node));
  return props;
}

function wizardRoot() {
  return screen.getByTestId('settings-reference-csv-import-wizard');
}

function wizardStep(name: RegExp) {
  return within(wizardRoot()).getByRole('region', { name });
}

describe('SET-053 reference CSV import wizard UX contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/reference/allergens_reference/import');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the localized AppShell route as a 3-step upload wizard with template download, .csv type, max-size, and expected header guidance', async () => {
    await renderReferenceImport();

    const root = wizardRoot();
    expect(root).toHaveAttribute('data-screen', 'reference-csv-import-wizard');
    expect(root).toHaveAttribute('data-route', '/settings/reference/allergens_reference/import');
    expect(root).toHaveAttribute('data-ux-source', 'SET-053');
    expect(screen.getByRole('heading', { name: /csv import wizard/i })).toBeInTheDocument();

    const stepper = within(root).getByRole('list', { name: /import steps/i });
    expect(within(stepper).getAllByRole('listitem').map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(/^1\s+Upload$/i),
      expect.stringMatching(/^2\s+Preview$/i),
      expect.stringMatching(/^3\s+Commit$/i),
    ]);

    const uploadStep = wizardStep(/step 1.*upload/i);
    expect(within(uploadStep).getByText(/drop your csv file here or click to browse/i)).toBeInTheDocument();
    expect(within(uploadStep).getByText(/accepted:\s*\.csv only/i)).toBeInTheDocument();
    expect(within(uploadStep).getByText(/max\s*5mb/i)).toBeInTheDocument();
    expect(within(uploadStep).getByText(/first row must contain column headers matching:/i)).toHaveTextContent(
      /allergen_code, display_name, risk_level, is_enabled/i,
    );
    expect(within(uploadStep).getByRole('link', { name: /download template csv/i })).toHaveAttribute('href', expect.stringContaining('template'));
    expect(within(uploadStep).getByLabelText(/csv file/i)).toHaveAttribute('accept', expect.stringContaining('.csv'));
  });

  it('shows the preview summary and fails closed when the uploaded CSV header does not match the reference schema', async () => {
    await renderReferenceImport({ initialStep: 'preview', preview: mismatchedHeaderPreview });

    const previewStep = wizardStep(/step 2.*preview/i);
    expect(within(previewStep).getByText(/parsed 8 rows/i)).toHaveTextContent(/4 to insert/i);
    expect(within(previewStep).getByText(/parsed 8 rows/i)).toHaveTextContent(/2 to update/i);
    expect(within(previewStep).getByText(/parsed 8 rows/i)).toHaveTextContent(/1 to skip/i);
    expect(within(previewStep).getByText(/parsed 8 rows/i)).toHaveTextContent(/1 errors/i);
    expect(within(previewStep).getByRole('alert')).toHaveTextContent(
      'Header mismatch — expected: allergen_code, display_name, risk_level, is_enabled',
    );
    expect(within(previewStep).getByRole('button', { name: /commit import/i })).toBeDisabled();
    expect(within(previewStep).getByRole('button', { name: /show errors only/i })).toBeInTheDocument();
    expect(within(previewStep).getByRole('table', { name: /csv preview rows/i })).toHaveTextContent('allergen_code is required');
  });

  it('renders commit progress, persisted action counts from the commit result, a parent table link, and downloadable error rows', async () => {
    await renderReferenceImport({
      initialStep: 'commit',
      preview: validPreview,
      commitResult: {
        status: 'complete',
        inserted: 4,
        updated: 2,
        skipped: 1,
        errors: 1,
        errorRowsDownloadHref: '/en/settings/reference/allergens_reference/import/errors.csv',
      },
    });

    const commitStep = wizardStep(/step 3.*commit/i);
    expect(within(commitStep).getByRole('progressbar', { name: /import progress/i })).toHaveAttribute('aria-valuenow', '100');
    expect(within(commitStep).getByText(/import complete/i)).toHaveTextContent(
      'Import complete. 4 inserted, 2 updated, 1 skipped, 1 errors.',
    );
    expect(within(commitStep).getByRole('link', { name: /return to table/i })).toHaveAttribute(
      'href',
      '/en/settings/reference/allergens_reference',
    );
    expect(within(commitStep).getByRole('link', { name: /download error rows/i })).toHaveAttribute(
      'href',
      '/en/settings/reference/allergens_reference/import/errors.csv',
    );
  });
});
