/**
 * @vitest-environment jsdom
 *
 * T-121 — Brief list↔detail navigation + modal-host wiring (slice of T-034).
 *
 * Proves the WIRING contract end to end (no mocks of production data — only the
 * transport boundary `withOrgContext` + the injected Server Actions are stubbed,
 * the same convention as the T-052 dashboard page test):
 *
 *   AC#1  list row → detail   : each row links to /<locale>/briefs/<id> (the
 *                               route the detail page now lives at; T-121 moved
 *                               brief/[briefId] → briefs/[briefId]).
 *   AC#2  back → list         : the detail breadcrumb 'Briefs' is a back-link to
 *                               /<locale>/briefs (filters preserved client-side).
 *   AC#3  breadcrumb labels   : detail breadcrumb reads 'NPD / Briefs / <devCode>'.
 *   modal host mounted        : the list page renders BriefModals; pushing
 *                               ?modal=briefCreate opens the Create modal and
 *                               ?modal=briefConvert&brief=<id> opens Complete.
 *   RBAC                      : the create Server Action is injected only when
 *                               canCreate (server-resolved), never client-trusted.
 *   i18n                      : labels resolve via next-intl keys with the
 *                               prototype fallback (no inline strings asserted).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BriefListPage from '../page';
import BriefDetailPage from '../[briefId]/page';
import type { BriefListRow } from '../_components/brief-list-table';
import type { BriefDetailData } from '../[briefId]/_components/brief-detail-form';

// ---- transport-boundary stubs (never replace production data) ----------------

const { withOrgContextMock, hasPermissionRows } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
  hasPermissionRows: { value: true },
}));

// withOrgContext is shared by the list page, the detail page, and the modal host.
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

// Inject Server Actions so the host stays a pure boundary (owned by T-031/T-033).
vi.mock('../../../../../(npd)/brief/actions/create-brief', () => ({
  createBrief: vi.fn(async () => ({ ok: true, briefId: 'new-brief', npdProjectId: 'p', devCode: 'DEV26-099' })),
}));
vi.mock('../../../../../(npd)/brief/actions/convert-brief-to-fa', () => ({
  completeBriefForProject: vi.fn(async () => ({
    ok: true,
    briefId: 'b',
    npdProjectId: 'p',
    legacyProductCode: null,
    v08Status: 'PASS' as const,
  })),
}));
vi.mock('../../../../../(npd)/brief/actions/save-brief-draft', () => ({
  saveBriefDraft: vi.fn(async () => undefined),
}));

// next-intl: resolve to the key so missing keys fall back to the prototype
// defaults (the production page degrades to DEFAULT_LABELS the same way).
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

// next/link → <a> so we can assert hrefs; next/navigation for the client host.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

const pushMock = vi.fn();
const searchParamsRef = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/briefs',
  useSearchParams: () => searchParamsRef.value,
}));

// Lightweight Modal so the host's open/closed mapping is observable in jsdom.
vi.mock('@monopilot/ui/Modal', () => {
  const Modal = ({
    open,
    children,
    modalId,
  }: {
    open: boolean;
    children: React.ReactNode;
    modalId?: string;
  }) => (open ? <div role="dialog" data-modal-id={modalId}>{children}</div> : null);
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { default: Modal };
});

// withOrgContext runs a callback with a fake org ctx. The fake client answers the
// permission probe (rows length controls grant) + brief-summary read for ?brief=.
function makeCtx() {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    orgId: '00000000-0000-0000-0000-000000000002',
    client: {
      query: vi.fn(async (sql: string) => {
        if (/from public\.user_roles/.test(sql)) {
          return { rows: hasPermissionRows.value ? [{ ok: true }] : [] };
        }
        if (/from public\.brief\b/.test(sql)) {
          return {
            rows: [
              {
                brief_id: '11111111-1111-1111-1111-111111111111',
                dev_code: 'DEV26-052',
                product_name: 'Strawberry Yogurt 150g',
                template: 'single_component',
                status: 'complete',
                volume: '1200',
                packs_per_case: 6,
                comments: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPermissionRows.value = true;
  searchParamsRef.value = new URLSearchParams();
  withOrgContextMock.mockImplementation(async (cb: (ctx: ReturnType<typeof makeCtx>) => unknown) =>
    cb(makeCtx()),
  );
});

afterEach(() => cleanup());

const ROWS: BriefListRow[] = [
  {
    briefId: '11111111-1111-1111-1111-111111111111',
    devCode: 'DEV26-052',
    productName: 'Strawberry Yogurt 150g',
    template: 'single_component',
    status: 'complete',
    createdAt: '2026-05-01',
    owner: 'Ana Owner',
    projectCode: 'DEV-052',
    projectGate: 'G0',
    projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
];

const DETAIL: BriefDetailData = {
  briefId: '11111111-1111-1111-1111-111111111111',
  devCode: 'DEV26-052',
  productName: 'Strawberry Yogurt 150g',
  template: 'single_component',
  status: 'draft',
  faCode: null,
  npdProjectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  product: {
    product: 'Strawberry Yogurt 150g',
    volume: '1200',
    devCode: 'DEV26-052',
    packsPerCase: 6,
    benchmark: null,
    comments: null,
    summaryComponent: null,
    summarySliceCount: null,
    summarySupplier: null,
    summaryCode: null,
    summaryPrice: null,
    summaryWeights: null,
    summaryPct: null,
  },
  components: [],
  packaging: {
    primaryPackaging: null,
    secondaryPackaging: null,
    baseWebCode: null,
    baseWebPrice: null,
    topWebType: null,
    sleeveCartonCode: null,
    sleeveCartonPrice: null,
  },
  packagingExt: {},
  targetWeightG: '220',
  weightToleranceG: '5',
};

async function renderList(
  overrides: Partial<Parameters<typeof BriefListPage>[0]> = {},
) {
  const ui = await BriefListPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    rows: ROWS,
    canCreate: true,
    canConvert: true,
    state: 'ready',
    ...(overrides as object),
  });
  return render(ui as React.ReactElement);
}

async function renderDetail(overrides: Record<string, unknown> = {}) {
  const ui = await BriefDetailPage({
    params: Promise.resolve({ locale: 'en', briefId: '11111111-1111-1111-1111-111111111111' }),
    data: DETAIL,
    state: 'ready',
    canWrite: true,
    ...overrides,
  });
  return render(ui as React.ReactElement);
}

describe('T-121 — list → detail navigation', () => {
  it('AC#1: each row links to the locale-prefixed /briefs/<id> detail route', async () => {
    await renderList();
    const link = screen.getByRole('link', { name: /DEV26-052/ });
    expect(link).toHaveAttribute('href', '/en/briefs/11111111-1111-1111-1111-111111111111');
  });

  it('AC#1: the row "open" action also targets the detail route', async () => {
    await renderList();
    const openLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/en/briefs/11111111-1111-1111-1111-111111111111');
    // dev-code link + open link both resolve to the detail route.
    expect(openLinks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('T-121 — detail → list back navigation', () => {
  it('AC#2/#3: the breadcrumb "Briefs" crumb is a back-link to the list', async () => {
    await renderDetail();
    const crumb = screen.getByTestId('brief-detail-breadcrumb-list');
    expect(crumb.tagName).toBe('A');
    expect(crumb).toHaveAttribute('href', '/en/briefs');
  });

  it('AC#3: the breadcrumb reads NPD / Briefs / <devCode>', async () => {
    await renderDetail();
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    // Detail labels resolve through the page's getTranslations → prototype
    // fallback (breadcrumbRoot='NPD', breadcrumbList='Briefs').
    expect(within(nav).getByText('NPD')).toBeInTheDocument();
    const crumb = within(nav).getByTestId('brief-detail-breadcrumb-list');
    expect(crumb).toHaveTextContent('Briefs');
    expect(within(nav).getByText('DEV26-052')).toBeInTheDocument();
  });
});

describe('T-121 — modal host mount (?modal= triggers)', () => {
  it('mounts the host and opens the Create modal on ?modal=briefCreate', async () => {
    searchParamsRef.value = new URLSearchParams('modal=briefCreate');
    await renderList();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-modal-id', 'briefCreate');
  });

  it('opens the Complete modal on ?modal=briefConvert&brief=<id> with a server-fetched summary', async () => {
    searchParamsRef.value = new URLSearchParams(
      'modal=briefConvert&brief=11111111-1111-1111-1111-111111111111',
    );
    await renderList({ searchParams: Promise.resolve({
      modal: 'briefConvert',
      brief: '11111111-1111-1111-1111-111111111111',
    }) });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-modal-id', 'briefComplete');
    // The summary table carries real org-scoped brief evidence (dev code).
    expect(within(dialog).getByText('DEV26-052')).toBeInTheDocument();
  });

  it('renders no dialog when no ?modal= trigger is present', async () => {
    await renderList();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('T-121 — RBAC (server-resolved, never client-trusted)', () => {
  it('forbids the Complete modal action when the user lacks brief.convert_to_fa', async () => {
    hasPermissionRows.value = false; // server denies all permission probes
    searchParamsRef.value = new URLSearchParams(
      'modal=briefConvert&brief=11111111-1111-1111-1111-111111111111',
    );
    await renderList({ searchParams: Promise.resolve({
      modal: 'briefConvert',
      brief: '11111111-1111-1111-1111-111111111111',
    }) });
    const dialog = await screen.findByRole('dialog');
    // forbidden status surfaces the gated copy (not the completable summary):
    // the server resolved permission_denied → host injects no action + status.
    expect(dialog.querySelector('[data-slot="brief-complete-forbidden"]')).not.toBeNull();
    expect(within(dialog).queryByTestId('brief-complete-summary')).toBeNull();
  });
});
