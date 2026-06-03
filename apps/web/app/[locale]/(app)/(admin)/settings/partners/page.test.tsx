/**
 * @vitest-environment jsdom
 * Wave 5 (Class D build-now) — /settings/partners schema-driven reference screen.
 *
 * Proves the route reads REAL reference_tables data via withOrgContext (no
 * injected props, no hardcoded array) and renders the shared reference-data
 * screen — never the SettingsRouteStub. Parity source: the reference-data
 * screen at settings/reference (admin-screens.jsx:561-621 reference_data_screen).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withOrgContext: vi.fn(),
  upsertReferenceRow: vi.fn(),
  softDeleteReferenceRow: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: mocks.withOrgContext,
}));

vi.mock('../../../../../../actions/reference/upsert', () => ({
  upsertReferenceRow: mocks.upsertReferenceRow,
}));

vi.mock('../../../../../../actions/reference/soft-delete', () => ({
  softDeleteReferenceRow: mocks.softDeleteReferenceRow,
}));

type FakeRow = Record<string, unknown>;
type DbScript = { schema: FakeRow[]; rows: FakeRow[]; canEdit: boolean };

function wireLiveRead(script: DbScript) {
  mocks.withOrgContext.mockImplementation(
    async (action: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>) => {
      const client = {
        query: async (sql: string) => {
          if (/from\s+public\.reference_schemas/i.test(sql)) {
            return { rows: script.schema, rowCount: script.schema.length };
          }
          if (/count\(\*\)\s+as\s+row_count/i.test(sql)) {
            return {
              rows: script.rows.length
                ? [{ table_code: 'partners', row_count: script.rows.length, updated_at: '2026-06-01T00:00:00.000Z' }]
                : [],
              rowCount: script.rows.length ? 1 : 0,
            };
          }
          if (/from\s+public\.reference_tables/i.test(sql)) {
            return { rows: script.rows, rowCount: script.rows.length };
          }
          if (/public\.role_permissions/i.test(sql)) {
            return script.canEdit ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        },
      };
      return action({ userId: 'partner-user', orgId: 'partner-org', client });
    },
  );
}

const liveSchema: FakeRow[] = [
  { table_code: 'reference.partners', column_code: 'partner_code', data_type: 'text', presentation_json: { label: 'Partner code' } },
  { table_code: 'reference.partners', column_code: 'name', data_type: 'text', presentation_json: { label: 'Name' } },
  { table_code: 'reference.partners', column_code: 'partner_type', data_type: 'enum', presentation_json: { label: 'Type' } },
  { table_code: 'reference.partners', column_code: 'status', data_type: 'enum', presentation_json: { label: 'Status' } },
];

const liveRows: FakeRow[] = [
  { table_code: 'partners', row_key: 'SUP-0001', row_data: { partner_code: 'SUP-0001', name: 'Baseline Ingredients Supplier', partner_type: 'supplier', status: 'active' }, version: 1, is_active: true, updated_at: '2026-06-01T00:00:00.000Z' },
  { table_code: 'partners', row_key: 'CUST-0001', row_data: { partner_code: 'CUST-0001', name: 'Baseline Retail Customer', partner_type: 'customer', status: 'active' }, version: 1, is_active: true, updated_at: '2026-06-01T00:00:00.000Z' },
];

async function renderPage() {
  const mod = (await import(/* @vite-ignore */ './page')) as { default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode> };
  const node = await mod.default({ params: Promise.resolve({ locale: 'en' }) });
  return render(<>{node}</>);
}

afterEach(() => cleanup());

describe('/settings/partners schema-driven reference screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withOrgContext.mockReset();
  });

  it('reads real reference_tables rows via withOrgContext and renders them (not the SettingsRouteStub)', async () => {
    wireLiveRead({ schema: liveSchema, rows: liveRows, canEdit: true });
    const { container } = await renderPage();

    expect(mocks.withOrgContext, 'page must read through the org-scoped HOF, not a hardcoded array').toHaveBeenCalled();
    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();

    const table = screen.getByRole('table');
    expect(within(table).getByText('SUP-0001')).toBeInTheDocument();
    expect(within(table).getByText('Baseline Ingredients Supplier')).toBeInTheDocument();
    expect(within(table).getByText('CUST-0001')).toBeInTheDocument();
  });

  it('falls back to the empty state (no stub, no fabricated rows) when org context is unavailable', async () => {
    mocks.withOrgContext.mockRejectedValueOnce(new Error('org context unavailable'));
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();
    expect(screen.queryByText('SUP-0001')).not.toBeInTheDocument();
  });
});
