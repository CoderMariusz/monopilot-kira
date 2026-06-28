/**
 * @vitest-environment jsdom
 *
 * A2 (NPD-DYN, mig 374) — FA detail page render plumbing for AUTO-DERIVED fields.
 *
 * mig 374 added public.npd_field_catalog.is_auto + auto_source_field. When a Core
 * field is marked is_auto, its rendered FA value is READ-TIME derived from the
 * SOURCE field's current value and shown READ-ONLY (auto styling), never an
 * independently editable input. This asserts the page-level plumbing:
 *   (a) the auto DeptColumn arrives at FaCoreTab with readOnly + auto set;
 *   (b) the read-only input shows the SOURCE field's value (override), NOT the
 *       (empty/stale) value stored directly on the auto column.
 *
 * The org-context transport is mocked (same boundary as page.test.tsx); the SQL
 * the loader builds still runs as written — we route the DeptColumns load, the
 * to_jsonb(product) read, and the RBAC probe by SQL shape.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FaDetailPage from './page';

const { withOrgContextMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/fa/FA0099',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// English-only label resolution stub — the auto-field plumbing under test is
// data-driven, not copy-driven; returning the key keeps the assertions on the
// rendered VALUE / readonly markers rather than localized strings.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const FA_ROW = {
  product_code: 'FA0099',
  product_name: 'Auto Field FG',
  status_overall: 'InProgress',
  built: false,
};

/**
 * The auto Core column `auto_label` is is_auto=true sourcing from `source_label`.
 * The product row carries source_label='SOURCE-VALUE' but auto_label='STALE' — the
 * loader must override auto_label to mirror source_label at read time.
 */
const AUTO_COLUMN = {
  column_key: 'auto_label',
  physical_column: 'auto_label',
  field_type: 'string',
  data_type: 'text',
  required_for_done: false,
  dropdown_source: null,
  blocking_rule: null,
  display_order: 2,
  is_auto: true,
  auto_source_field: 'source_label',
};
const SOURCE_COLUMN = {
  column_key: 'source_label',
  physical_column: 'source_label',
  field_type: 'string',
  data_type: 'text',
  required_for_done: false,
  dropdown_source: null,
  blocking_rule: null,
  display_order: 1,
  is_auto: false,
  auto_source_field: null,
};

function wireOrgContext() {
  const productJson = {
    ...FA_ROW,
    closed_core: 'Yes',
    closed_production: 'Yes',
    source_label: 'SOURCE-VALUE',
    auto_label: 'STALE',
  };
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        const text = String(sql);
        if (/role_permissions|permissions|user_roles/i.test(text)) {
          return { rows: [{ ok: true }] };
        }
        if (/to_jsonb\(p\.\*\)/i.test(text)) {
          return { rows: [{ product_json: productJson }] };
        }
        // DeptColumns load — only the Core dept gets the auto + source columns.
        if (/from\s+"Reference"\."DeptColumns"/i.test(text)) {
          const deptArg = String(params?.[0] ?? '').toLowerCase();
          if (deptArg === 'core') {
            return { rows: [SOURCE_COLUMN, AUTO_COLUMN] };
          }
          return { rows: [] };
        }
        if (/from\s+public\.(product|fa)/i.test(text) && /product_code/i.test(text)) {
          return { rows: [FA_ROW] };
        }
        // prod_detail / dropdowns / history / etc.
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderPage() {
  const ui = await FaDetailPage({ params: Promise.resolve({ locale: 'en', productCode: 'FA0099' }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  wireOrgContext();
});

afterEach(() => cleanup());

describe('A2 FA detail page — auto-derived field render plumbing (mig 374)', () => {
  it('renders the auto Core field READ-ONLY', async () => {
    await renderPage();
    const coreTab = screen.getByTestId('fa-core-tab');
    const autoField = within(coreTab).getByTestId
      ? coreTab.querySelector('[data-field="auto_label"]')
      : null;
    expect(autoField).not.toBeNull();
    expect(autoField).toHaveAttribute('data-readonly', 'true');
  });

  it("overrides the auto field VALUE with the SOURCE field's current value", async () => {
    await renderPage();
    const coreTab = screen.getByTestId('fa-core-tab');
    const autoField = coreTab.querySelector('[data-field="auto_label"]') as HTMLElement;
    expect(autoField).not.toBeNull();
    const input = autoField.querySelector('input') as HTMLInputElement;
    // Read-time derivation: shows the SOURCE value, never the stale stored value.
    expect(input.value).toBe('SOURCE-VALUE');
    expect(input.value).not.toBe('STALE');
    expect(input).toHaveAttribute('readonly');
  });

  it('keeps the SOURCE field editable (not read-only)', async () => {
    await renderPage();
    const coreTab = screen.getByTestId('fa-core-tab');
    const sourceField = coreTab.querySelector('[data-field="source_label"]') as HTMLElement;
    expect(sourceField).not.toBeNull();
    // The non-auto source column is NOT marked data-readonly.
    expect(sourceField).not.toHaveAttribute('data-readonly', 'true');
  });
});
