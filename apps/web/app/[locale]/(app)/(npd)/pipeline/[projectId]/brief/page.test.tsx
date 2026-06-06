/**
 * @vitest-environment jsdom
 *
 * NPD project-stage Brief page (RSC) — parity + states + i18n + RBAC.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:45-105 (BriefScreen):
 *   "Project brief" card (✓ Completed badge + 2-col form + claims/constraints/notes)
 *   + "Attachments" card (Upload + rows).
 *
 * The production page reads via readProjectBrief (withOrgContext / RLS). We mock
 * that transport boundary and drive the render through the `state`/`data`
 * injection seam so the suite asserts parity structure + the 5 UI states + label
 * resolution + the RBAC permission-denied panel — without a live pg pool.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── next-intl/server: serve INLINE briefStage messages (no fixture JSON). ──
const INLINE_MESSAGES: Record<string, Record<string, string>> = {
  'npd.briefStage': {
    cardTitle: 'Project brief',
    completed: 'Completed',
    fieldProductName: 'Product name',
    fieldCategory: 'Category',
    fieldTargetLaunch: 'Target launch date',
    fieldTargetPrice: 'Target retail price (EUR)',
    fieldPackFormat: 'Pack format',
    fieldSalesChannel: 'Sales channel',
    fieldExpectedVolume: 'Expected volume',
    fieldTargetAudience: 'Target audience',
    fieldMarketingClaims: 'Marketing claims',
    fieldConstraints: 'Constraints & requirements',
    fieldNotes: 'Notes',
    attachmentsTitle: 'Attachments',
    upload: 'Upload',
    uploadDisabledHint: 'Uploading attachments is not available yet.',
    attachmentsEmpty: 'No attachments on this brief.',
    notProvided: '—',
    loading: 'Loading brief…',
    empty: 'No brief linked to this project.',
    emptyBody: 'This project was created without a brief, or the brief is not visible to you.',
    error: 'Unable to load the brief.',
    forbidden: 'You do not have permission to view this brief.',
  },
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: { locale?: string; namespace?: string }) => {
    const ns = INLINE_MESSAGES[req?.namespace ?? ''] ?? {};
    return (key: string) => ns[key] ?? key;
  }),
}));

// ── Transport boundary the page imports at module load (not exercised via inject). ──
vi.mock('./_actions/read-project-brief', () => ({
  readProjectBrief: vi.fn(),
}));

import ProjectBriefPage from './page';
import type { ProjectBriefView } from './_actions/read-project-brief';

const READY: ProjectBriefView = {
  briefId: 'b-1',
  devCode: 'DEV2511-1',
  projectName: 'Sliced Ham 200g',
  status: 'converted',
  productName: 'Sliced Ham 200g',
  targetLaunchDate: '2026-09-01',
  packFormat: '200g sliced pack',
  expectedVolume: '1200',
  marketingClaims: 'High protein · No phosphates',
  category: null,
  targetRetailPriceEur: '19.90',
  salesChannel: null,
  targetAudience: null,
  constraints: 'Shelf life >= 28 days',
  notes: 'Carrefour PL listing target',
};

async function renderPage(args: { state?: string; data?: ProjectBriefView | null }) {
  const ui = await ProjectBriefPage({
    params: Promise.resolve({ locale: 'en', projectId: 'p1' }),
    ...args,
  });
  return render(ui as React.ReactElement);
}

afterEach(() => cleanup());

describe('NPD project-stage Brief page (project.jsx:45-105)', () => {
  it('parity: renders the Project brief card with the ✓ Completed badge', async () => {
    await renderPage({ state: 'ready', data: READY });
    expect(screen.getByTestId('project-brief-card-title')).toHaveTextContent('Project brief');
    expect(screen.getByTestId('project-brief-completed-badge')).toHaveTextContent('✓ Completed');
  });

  it('parity: renders all 8 two-column fields + claims/constraints/notes from real-shaped props', async () => {
    await renderPage({ state: 'ready', data: READY });
    // LEFT/RIGHT grid fields.
    expect(screen.getByTestId('project-brief-field-product-name')).toHaveTextContent('Sliced Ham 200g');
    expect(screen.getByTestId('project-brief-field-target-launch-date')).toHaveTextContent('2026-09-01');
    expect(screen.getByTestId('project-brief-field-target-retail-price-eur')).toHaveTextContent('19.90');
    expect(screen.getByTestId('project-brief-field-pack-format')).toHaveTextContent('200g sliced pack');
    expect(screen.getByTestId('project-brief-field-expected-volume')).toHaveTextContent('1200');
    // full-width.
    expect(screen.getByTestId('project-brief-field-marketing-claims')).toHaveTextContent('High protein');
    expect(screen.getByTestId('project-brief-field-constraints-requirements')).toHaveTextContent('Shelf life');
    expect(screen.getByTestId('project-brief-field-notes')).toHaveTextContent('Carrefour PL');
  });

  it('parity: unmapped fields fall back to the em-dash placeholder (read-oriented)', async () => {
    await renderPage({ state: 'ready', data: READY });
    expect(screen.getByTestId('project-brief-field-category')).toHaveTextContent('—');
    expect(screen.getByTestId('project-brief-field-sales-channel')).toHaveTextContent('—');
    expect(screen.getByTestId('project-brief-field-target-audience')).toHaveTextContent('—');
  });

  it('parity: renders the Attachments card + disabled Upload (not faked) + empty list', async () => {
    await renderPage({ state: 'ready', data: READY });
    expect(screen.getByTestId('project-brief-attachments')).toBeInTheDocument();
    expect(screen.getByTestId('project-brief-upload')).toBeDisabled();
    expect(screen.getByTestId('project-brief-attachments-empty')).toHaveTextContent('No attachments on this brief.');
  });

  it('i18n: labels resolve through the npd.briefStage namespace (no raw keys)', async () => {
    await renderPage({ state: 'ready', data: READY });
    const card = screen.getByTestId('project-brief-screen');
    expect(card.textContent).not.toContain('cardTitle');
    expect(card.textContent).not.toContain('briefStage');
    expect(card.textContent).toContain('Expected volume');
  });

  it('UI state — loading renders the skeleton panel', async () => {
    await renderPage({ state: 'loading', data: null });
    expect(screen.getByTestId('project-brief-loading')).toBeInTheDocument();
  });

  it('UI state — empty (no brief linked) renders the empty panel', async () => {
    await renderPage({ state: 'empty', data: null });
    expect(screen.getByTestId('project-brief-empty')).toHaveTextContent('No brief linked to this project.');
  });

  it('UI state — error renders the error panel', async () => {
    await renderPage({ state: 'error', data: null });
    expect(screen.getByTestId('project-brief-error')).toHaveTextContent('Unable to load the brief.');
  });

  it('RBAC: permission_denied renders the forbidden panel (never client-trusted)', async () => {
    await renderPage({ state: 'permission_denied', data: null });
    expect(screen.getByTestId('project-brief-forbidden')).toHaveTextContent(
      'You do not have permission to view this brief.',
    );
  });
});
