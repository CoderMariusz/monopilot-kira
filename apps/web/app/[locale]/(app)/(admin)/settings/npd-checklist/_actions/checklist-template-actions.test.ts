import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  permissionGranted: true,
  templateRows: [] as Array<Record<string, unknown>>,
  maxSequenceRows: [{ next_sequence: 3 }] as Array<Record<string, unknown>>,
  updateReturning: [{ gate_code: 'G0' }] as Array<Record<string, unknown>>,
  deleteReturning: [{ sequence: 2 }] as Array<Record<string, unknown>>,
  selectSequenceRows: [{ sequence: 2 }] as Array<Record<string, unknown>>,
  neighborRows: [{ sequence: 1 }] as Array<Record<string, unknown>>,
  openProjectRows: [{ id: 'project-1' }] as Array<Record<string, unknown>>,
  projectItemRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({
      userId: 'user-1',
      orgId: 'org-1',
      client: {
        async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
          harness.calls.push({ sql, params });
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

          if (normalized.includes('from public.user_roles')) {
            return {
              rows: (harness.permissionGranted ? [{ ok: true }] : []) as T[],
              rowCount: harness.permissionGranted ? 1 : 0,
            };
          }

          if (normalized.includes('coalesce(max(sequence), 0) + 1')) {
            return { rows: harness.maxSequenceRows as T[], rowCount: harness.maxSequenceRows.length };
          }

          if (normalized.startsWith('insert into "reference"."gatechecklisttemplates"')) {
            return { rows: [] as T[], rowCount: 1 };
          }

          if (normalized.startsWith('update "reference"."gatechecklisttemplates"') && normalized.includes('returning gate_code')) {
            return { rows: harness.updateReturning as T[], rowCount: harness.updateReturning.length };
          }

          if (normalized.startsWith('delete from "reference"."gatechecklisttemplates"')) {
            return { rows: harness.deleteReturning as T[], rowCount: harness.deleteReturning.length };
          }

          if (normalized.startsWith('select sequence') && normalized.includes('gatechecklisttemplates')) {
            if (params[2] === 1) {
              return { rows: harness.neighborRows as T[], rowCount: harness.neighborRows.length };
            }
            return { rows: harness.selectSequenceRows as T[], rowCount: harness.selectSequenceRows.length };
          }

          if (normalized.includes('from "reference"."gatechecklisttemplates"') && normalized.includes('order by gate_code')) {
            return { rows: harness.templateRows as T[], rowCount: harness.templateRows.length };
          }

          if (normalized.includes('from public.npd_projects') && normalized.includes("current_gate <> 'launched'")) {
            return { rows: harness.openProjectRows as T[], rowCount: harness.openProjectRows.length };
          }

          if (normalized.includes('from public.gate_checklist_items')) {
            return { rows: harness.projectItemRows as T[], rowCount: harness.projectItemRows.length };
          }

          if (normalized.startsWith('insert into public.audit_events')) {
            return { rows: [] as T[], rowCount: 1 };
          }

          return { rows: [] as T[], rowCount: 0 };
        },
      },
    }),
}));

import { listChecklistTemplates } from './list-checklist-templates';
import {
  addChecklistTemplateItem,
  deleteChecklistTemplateItem,
  reorderChecklistTemplateItem,
  updateChecklistTemplateItem,
} from './checklist-template-mutations';
import { propagateChecklistTemplates } from './propagate-checklist-templates';

beforeEach(() => {
  harness.calls = [];
  harness.permissionGranted = true;
  harness.templateRows = [
    {
      template_id: 'APEX_DEFAULT',
      gate_code: 'G0',
      sequence: 1,
      category_code: 'business',
      item_text: 'Product concept documented',
      required: true,
    },
  ];
  harness.maxSequenceRows = [{ next_sequence: 2 }];
  harness.updateReturning = [{ gate_code: 'G0' }];
  harness.deleteReturning = [{ sequence: 2 }];
  harness.selectSequenceRows = [{ sequence: 2 }];
  harness.neighborRows = [{ sequence: 1 }];
  harness.openProjectRows = [{ id: 'project-1' }];
  harness.projectItemRows = [
    {
      id: 'item-1',
      gate_code: 'G0',
      category_code: 'business',
      item_text: 'Old text',
      required: false,
      completed_at: null,
      ord: 1,
    },
  ];
});

describe('listChecklistTemplates', () => {
  it('returns forbidden without npd.schema.edit', async () => {
    harness.permissionGranted = false;
    await expect(listChecklistTemplates()).resolves.toEqual({ ok: false, code: 'forbidden' });
  });

  it('groups templates by gate', async () => {
    const result = await listChecklistTemplates();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.G0).toHaveLength(1);
    expect(result.data.G0[0]?.itemText).toBe('Product concept documented');
    expect(harness.calls.some((call) => call.sql.includes('app.current_org_id()'))).toBe(true);
  });
});

describe('addChecklistTemplateItem', () => {
  it('rejects invalid input', async () => {
    await expect(addChecklistTemplateItem({ gateCode: 'G0', categoryCode: 'business', itemText: '  ', required: true })).resolves.toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });

  it('inserts at the next sequence within the gate', async () => {
    const result = await addChecklistTemplateItem({
      gateCode: 'G0',
      categoryCode: 'technical',
      itemText: 'New feasibility check',
      required: false,
    });
    expect(result).toEqual({ ok: true });
    const insert = harness.calls.find((call) => call.sql.toLowerCase().includes('insert into "reference"."gatechecklisttemplates"'));
    expect(insert?.params).toEqual(['APEX_DEFAULT', 'G0', 'technical', 'New feasibility check', false, 2]);
  });
});

describe('updateChecklistTemplateItem', () => {
  it('updates template fields org-scoped', async () => {
    const result = await updateChecklistTemplateItem({
      gateCode: 'G0',
      sequence: 1,
      itemText: 'Updated text',
      required: true,
    });
    expect(result).toEqual({ ok: true });
    const update = harness.calls.find((call) => call.sql.toLowerCase().includes('update "reference"."gatechecklisttemplates"'));
    expect(update?.sql).toContain('app.current_org_id()');
    expect(update?.params).toContain('Updated text');
  });
});

describe('deleteChecklistTemplateItem', () => {
  it('deletes and renumbers the gate', async () => {
    const result = await deleteChecklistTemplateItem({ gateCode: 'G0', sequence: 2 });
    expect(result).toEqual({ ok: true });
    expect(harness.calls.some((call) => call.sql.toLowerCase().includes('delete from "reference"."gatechecklisttemplates"'))).toBe(true);
    expect(harness.calls.some((call) => call.sql.toLowerCase().includes('row_number() over (order by sequence)'))).toBe(true);
  });
});

describe('reorderChecklistTemplateItem', () => {
  it('swaps adjacent sequences', async () => {
    const result = await reorderChecklistTemplateItem({
      gateCode: 'G0',
      sequence: 2,
      direction: 'up',
    });
    expect(result).toEqual({ ok: true });
    expect(harness.calls.filter((call) => call.sql.toLowerCase().includes('update "reference"."gatechecklisttemplates"')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('propagateChecklistTemplates', () => {
  it('targets only open (non-launched) projects', async () => {
    harness.templateRows = [
      {
        gate_code: 'G0',
        sequence: 1,
        category_code: 'business',
        item_text: 'Updated text',
        required: true,
      },
    ];
    const result = await propagateChecklistTemplates({});
    expect(result).toMatchObject({
      ok: true,
      projectsTouched: 1,
      itemsUpdated: 1,
    });
    const openProjectsQuery = harness.calls.find((call) => call.sql.toLowerCase().includes('from public.npd_projects'));
    expect(openProjectsQuery?.sql).toContain("current_gate <> 'Launched'");
    expect(openProjectsQuery?.sql).toContain("current_stage <> 'launched'");
  });
});
