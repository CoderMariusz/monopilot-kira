/**
 * @vitest-environment jsdom
 * SET — Settings -> Documents screen RTL test.
 *
 * Parity basis: no dedicated prototype JSX exists for document numbering; this
 * screen mirrors the visual language / `.sg-*` primitive structure of the
 * sibling settings screens (settings/company + settings/processes). The test
 * asserts the parity checklist (PageHead `.sg-head`/`.sg-title`, one `.sg-section`
 * card per doc type, UoM-style closed-enum dropdowns), the LIVE PREVIEW
 * composition, the Save payload, the i18n-driven labels, and the RBAC
 * read/write permission states (denied panel + read-only note). All props are
 * real-data-shaped (DocumentSetting from `_actions/documents.ts`); no mocks.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import DocumentsScreen, {
  composeDocumentNumber,
  type DocumentSetting,
  type DocumentsScreenLabels,
} from './documents-screen.client';

const labels: DocumentsScreenLabels = {
  title: 'Document numbering',
  subtitle: 'Number formats and archiving for purchase, transfer and work orders.',
  loading: 'Loading document settings...',
  empty: 'No document settings are configured yet.',
  loadError: 'Unable to load document settings.',
  deniedTitle: 'Access denied',
  deniedBody: 'You do not have permission to view document settings.',
  readOnlyLabel: 'Read-only',
  readOnlyNotice: 'You can view document settings but cannot change them.',
  docTypeNames: { po: 'Purchase orders', to: 'Transfer orders', wo: 'Work orders' },
  fieldPrefix: 'Prefix',
  fieldPrefixHint: 'Leading text, e.g. PO.',
  fieldDatePart: 'Date part',
  fieldPadding: 'Sequence padding',
  fieldArchive: 'Archive after (days)',
  fieldArchiveHint: 'Received/closed documents older than this move to the Archive tab in Planning.',
  datePartOptions: { none: 'None', YYYY: 'Year', YYYYMM: 'Year-month', YYYYMMDD: 'Year-month-day' },
  previewLabel: 'Live preview',
  previewExample: 'example',
  archiveNever: 'Never archive',
  save: 'Save',
  saving: 'Saving...',
  saved: 'Saved.',
  saveError: 'Could not save document settings.',
  invalidInput: 'Check the highlighted fields.',
};

// Frozen date for deterministic preview composition (2026-06-11 UTC).
const NOW = new Date('2026-06-11T09:00:00.000Z');

const settings: DocumentSetting[] = [
  {
    docType: 'po',
    numberPrefix: 'PO',
    numberDatePart: 'YYYYMM',
    numberSeqPadding: 4,
    nextSeq: '7',
    archiveAfterDays: 365,
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    docType: 'to',
    numberPrefix: 'TO',
    numberDatePart: 'YYYY',
    numberSeqPadding: 5,
    nextSeq: '0',
    archiveAfterDays: null,
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    docType: 'wo',
    numberPrefix: 'WO',
    numberDatePart: 'none',
    numberSeqPadding: 3,
    nextSeq: '12',
    archiveAfterDays: 90,
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof DocumentsScreen>> = {}) {
  return render(<DocumentsScreen settings={settings} labels={labels} now={NOW} {...overrides} />);
}

afterEach(() => {
  cleanup();
  refreshMock.mockReset();
});

describe('composeDocumentNumber', () => {
  it('joins prefix + date-part + zero-padded sequence', () => {
    expect(composeDocumentNumber({ numberPrefix: 'PO', numberDatePart: 'YYYYMM', numberSeqPadding: 4 }, 7, NOW)).toBe(
      'PO-202606-0007',
    );
    expect(composeDocumentNumber({ numberPrefix: 'WO', numberDatePart: 'none', numberSeqPadding: 3 }, 12, NOW)).toBe(
      'WO-012',
    );
    expect(composeDocumentNumber({ numberPrefix: 'TO', numberDatePart: 'YYYYMMDD', numberSeqPadding: 6 }, 1, NOW)).toBe(
      'TO-20260611-000001',
    );
  });

  it('clamps padding into the 3-8 range and never produces seq 0', () => {
    expect(composeDocumentNumber({ numberPrefix: 'X', numberDatePart: 'none', numberSeqPadding: 2 }, 0, NOW)).toBe(
      'X-001',
    );
    expect(composeDocumentNumber({ numberPrefix: 'X', numberDatePart: 'none', numberSeqPadding: 99 }, 5, NOW)).toBe(
      'X-00000005',
    );
  });
});

describe('DocumentsScreen — parity + structure', () => {
  it('keeps the parity-source + data-screen anchors on the root', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main[data-screen="settings-documents"]');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('data-prototype-source')).toContain('spec-driven');
  });

  it('renders the page head from i18n labels', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.sg-head')).not.toBeNull();
    expect(container.querySelector('.sg-title')?.textContent).toBe('Document numbering');
  });

  it('renders one .sg-section card per doc type (PO/TO/WO)', () => {
    const { container } = renderScreen();
    expect(container.querySelectorAll('.sg-section').length).toBe(3);
    expect(screen.getByRole('region', { name: 'Purchase orders' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Transfer orders' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Work orders' })).toBeInTheDocument();
  });
});

describe('DocumentsScreen — live preview', () => {
  it('composes "Next" from real next_seq with no example badge', () => {
    renderScreen();
    expect(screen.getByTestId('doc-po-preview')).toHaveTextContent('PO-202606-0007');
    expect(screen.queryByTestId('doc-po-preview-example')).not.toBeInTheDocument();
  });

  it('falls back to an honestly-labelled example sequence when next_seq is absent/zero', () => {
    renderScreen();
    // TO has next_seq "0" -> example seq 1, padded to 5.
    expect(screen.getByTestId('doc-to-preview')).toHaveTextContent('TO-2026-00001');
    expect(screen.getByTestId('doc-to-preview-example')).toHaveTextContent('example');
  });

  it('recomposes the preview live as the date-part dropdown changes', async () => {
    const user = userEvent.setup();
    renderScreen({ canEdit: true, updateDocumentAction: vi.fn() });
    const card = screen.getByTestId('doc-wo-card');
    // WO starts with no date part -> WO-012.
    expect(screen.getByTestId('doc-wo-preview')).toHaveTextContent('WO-012');
    await user.click(within(card).getByLabelText('Date part'));
    await user.click(await screen.findByRole('option', { name: 'Year' }));
    await waitFor(() => expect(screen.getByTestId('doc-wo-preview')).toHaveTextContent('WO-2026-012'));
  });
});

describe('DocumentsScreen — save payload', () => {
  it('sends the typed enum payload and refreshes on success', async () => {
    const user = userEvent.setup();
    const updated: DocumentSetting = { ...settings[0], numberSeqPadding: 6, nextSeq: '7' };
    const updateDocumentAction = vi.fn(async () => ({ ok: true as const, setting: updated }));
    renderScreen({ canEdit: true, updateDocumentAction });

    const card = screen.getByTestId('doc-po-card');
    await user.click(within(card).getByLabelText('Sequence padding'));
    await user.click(await screen.findByRole('option', { name: '6' }));
    await user.click(screen.getByTestId('doc-po-save'));

    await waitFor(() => expect(updateDocumentAction).toHaveBeenCalledTimes(1));
    expect(updateDocumentAction).toHaveBeenCalledWith({
      docType: 'po',
      numberPrefix: 'PO',
      numberDatePart: 'YYYYMM',
      numberSeqPadding: 6,
      archiveAfterDays: 365,
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.getByTestId('doc-po-saved')).toHaveTextContent('Saved.');
  });

  it('surfaces a field error inline when archive days are invalid (no action call)', async () => {
    const user = userEvent.setup();
    const updateDocumentAction = vi.fn();
    renderScreen({ canEdit: true, updateDocumentAction });

    const card = screen.getByTestId('doc-po-card');
    const archive = within(card).getByLabelText('Archive after (days)');
    await user.clear(archive);
    await user.type(archive, '0');
    await user.click(screen.getByTestId('doc-po-save'));

    expect(screen.getByTestId('doc-po-archive-error')).toHaveTextContent('Check the highlighted fields.');
    expect(updateDocumentAction).not.toHaveBeenCalled();
  });

  it('surfaces the action invalid_input error inline', async () => {
    const user = userEvent.setup();
    const updateDocumentAction = vi.fn(async () => ({ ok: false as const, error: 'invalid_input' as const }));
    renderScreen({ canEdit: true, updateDocumentAction });

    const card = screen.getByTestId('doc-po-card');
    await user.click(within(card).getByLabelText('Sequence padding'));
    await user.click(await screen.findByRole('option', { name: '7' }));
    await user.click(screen.getByTestId('doc-po-save'));

    await waitFor(() => expect(screen.getByTestId('doc-po-error')).toHaveTextContent('Check the highlighted fields.'));
  });
});

describe('DocumentsScreen — RBAC + UI states', () => {
  it('renders the read-forbidden denied panel and no cards', () => {
    renderScreen({ state: 'denied' });
    expect(screen.getByTestId('documents-denied')).toHaveTextContent('Access denied');
    expect(screen.queryByTestId('doc-po-card')).not.toBeInTheDocument();
  });

  it('write-forbidden: cards visible, fields read-only, save hidden, note shown', () => {
    renderScreen({ canEdit: false });
    expect(screen.getByTestId('documents-readonly')).toHaveTextContent('Read-only');
    expect(screen.getByTestId('doc-po-card')).toBeInTheDocument();
    const prefix = within(screen.getByTestId('doc-po-card')).getByLabelText('Prefix');
    expect(prefix).toHaveAttribute('readonly');
    expect(screen.queryByTestId('doc-po-save')).not.toBeInTheDocument();
  });

  it('renders the loading state', () => {
    renderScreen({ state: 'loading' });
    expect(screen.getByTestId('documents-loading')).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    renderScreen({ settings: [] });
    expect(screen.getByTestId('documents-empty')).toBeInTheDocument();
  });

  it('renders the error state', () => {
    renderScreen({ state: 'error' });
    expect(screen.getByTestId('documents-error')).toHaveTextContent('Unable to load document settings.');
  });
});
