/**
 * @vitest-environment jsdom
 * Wave 5 (Class D build-now) — /settings/processes schema-driven reference screen.
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
                ? [{ table_code: 'processes', row_count: script.rows.length, updated_at: '2026-06-01T00:00:00.000Z' }]
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
      return action({ userId: 'proc-user', orgId: 'proc-org', client });
    },
  );
}

const liveSchema: FakeRow[] = [
  { table_code: 'reference.processes', column_code: 'process_code', data_type: 'text', presentation_json: { label: 'Process code' } },
  { table_code: 'reference.processes', column_code: 'name', data_type: 'text', presentation_json: { label: 'Name' } },
  { table_code: 'reference.processes', column_code: 'category', data_type: 'enum', presentation_json: { label: 'Category' } },
];

const liveRows: FakeRow[] = [
  { table_code: 'processes', row_key: 'MIXING', row_data: { process_code: 'MIXING', name: 'Ingredient mixing', category: 'preparation' }, version: 1, is_active: true, updated_at: '2026-06-01T00:00:00.000Z' },
  { table_code: 'processes', row_key: 'COOKING', row_data: { process_code: 'COOKING', name: 'Thermal processing / cooking', category: 'processing' }, version: 1, is_active: true, updated_at: '2026-06-01T00:00:00.000Z' },
];

async function renderPage() {
  const mod = (await import(/* @vite-ignore */ './page')) as { default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode> };
  const node = await mod.default({ params: Promise.resolve({ locale: 'en' }) });
  return render(<>{node}</>);
}

afterEach(() => cleanup());

describe('/settings/processes schema-driven reference screen', () => {
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
    expect(within(table).getByText('MIXING')).toBeInTheDocument();
    expect(within(table).getByText('Ingredient mixing')).toBeInTheDocument();
    expect(within(table).getByText('COOKING')).toBeInTheDocument();
  });

  it('falls back to the empty state (no stub, no fabricated rows) when org context is unavailable', async () => {
    mocks.withOrgContext.mockRejectedValueOnce(new Error('org context unavailable'));
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();
    expect(screen.queryByText('MIXING')).not.toBeInTheDocument();
  });
});
