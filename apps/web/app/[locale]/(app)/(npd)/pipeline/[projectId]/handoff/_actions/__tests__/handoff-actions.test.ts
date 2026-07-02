/**
 * NPD HANDOFF stage — Server Action unit tests (zod + RBAC + promote gating).
 *
 * `withOrgContext` is mocked to run the action body against a scriptable fake
 * client so we can assert: (1) zod rejects malformed input WITHOUT touching the
 * DB, (2) the RBAC gates (`npd.handoff.read` for read/toggle, `npd.handoff.promote`
 * for promote) are enforced, and (3) promote is GATED on a complete checklist
 * (incomplete → `checklist_incomplete`, no release call), and reuses the existing
 * factory-release flow when the checklist is complete.
 *
 * `next/cache` revalidatePath + the release flow (`releaseNpdProjectToFactory`)
 * are mocked (no Next request scope / no real DB in unit tests).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (sql: string, params: readonly unknown[]) => { rows: unknown[] } | undefined;

const handlerHolder: { handler: Handler } = { handler: () => ({ rows: [] }) };
const transactionEvents: string[] = [];

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) => {
    try {
      const result = await action({
        userId: '07300000-0000-4000-8000-0000000000aa',
        orgId: '07300000-0000-4000-8000-00000000000a',
        sessionToken: 'tok',
        client: {
          query: async (sql: string, params: readonly unknown[] = []) =>
            handlerHolder.handler(sql, params) ?? { rows: [] },
        },
      });
      transactionEvents.push('COMMIT');
      return result;
    } catch (error) {
      transactionEvents.push('ROLLBACK');
      throw error;
    }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// The real factory-release flow — mocked so the unit test never opens a DB.
const releaseMock = vi.fn();
vi.mock('../../../../../../../../(npd)/builder/_actions/release-npd-project-to-factory', () => ({
  releaseNpdProjectToFactory: (...args: unknown[]) => releaseMock(...args),
}));

import { getHandoff } from '../get-handoff';
import { toggleHandoffChecklistItem } from '../toggle-handoff-checklist-item';
import { promoteToProduction } from '../promote-to-production';

const PROJECT = '07300000-0000-4000-8000-0000000000c1';
const CHECKLIST = '07300000-0000-4000-8000-0000000000d1';
const ITEM = '07300000-0000-4000-8000-0000000000e1';

afterEach(() => {
  handlerHolder.handler = () => ({ rows: [] });
  transactionEvents.length = 0;
  releaseMock.mockReset();
  vi.clearAllMocks();
});

/** Permission handler: grants `granted`, denies everything else. */
function permHandler(granted: string[], rest?: Handler): Handler {
  return (sql, params) => {
    if (/role_permissions/.test(sql) && /rp.permission = \$3/.test(sql)) {
      const perm = params[2] as string;
      return { rows: granted.includes(perm) ? [{ ok: true }] : [] };
    }
    return rest ? rest(sql, params) : { rows: [] };
  };
}

describe('getHandoff — zod', () => {
  it('rejects a non-uuid projectId without hitting the DB', async () => {
    const spy = vi.fn(() => ({ rows: [] }));
    handlerHolder.handler = spy as unknown as Handler;
    const r = await getHandoff({ projectId: 'nope' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('getHandoff — RBAC + ready derivation', () => {
  it('returns forbidden when npd.handoff.read is missing', async () => {
    handlerHolder.handler = permHandler([]);
    const r = await getHandoff({ projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when no checklist exists for the project', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.read']);
    const r = await getHandoff({ projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('derives ready=true only when every item is checked', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.read'], (sql) => {
      if (/from public.handoff_checklists/.test(sql)) {
        return {
          rows: [
            {
              id: CHECKLIST,
              bom_verification_status: 'pending',
              destination_bom_code: 'BOM-238',
              promote_to_production_date: null,
              destination_warehouse_id: null,
            },
          ],
        };
      }
      if (/from public.handoff_checklist_items/.test(sql)) {
        return {
          rows: [
            { id: 'i1', label: 'Recipe locked', is_checked: true, display_order: 1 },
            { id: 'i2', label: 'Nutrition approved', is_checked: true, display_order: 2 },
          ],
        };
      }
      if (/from public.npd_projects/.test(sql)) {
        return { rows: [{ product_code: 'SKU-2451', product_name: 'Sliced Ham 200g' }] };
      }
      return { rows: [] };
    });

    const r = await getHandoff({ projectId: PROJECT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ready).toBe(true);
    expect(r.data.destinationBom.bomCode).toBe('BOM-238');
    expect(r.data.destinationBom.productSku).toBe('SKU-2451');
    expect(r.data.checklist).toHaveLength(2);
  });

  it('surfaces per-gate release status via the read-only preflight probe', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.read'], (sql) => {
      if (/from public.handoff_checklists/.test(sql)) {
        return {
          rows: [
            {
              id: CHECKLIST,
              bom_verification_status: 'pending',
              destination_bom_code: 'BOM-238',
              promote_to_production_date: null,
              destination_warehouse_id: null,
            },
          ],
        };
      }
      if (/from public.handoff_checklist_items/.test(sql)) {
        return { rows: [{ id: 'i1', label: 'Recipe locked', is_checked: true, display_order: 1 }] };
      }
      // The probe project lookup (current_gate + product_code) — note get-handoff
      // also queries npd_projects for product name; distinguish by the columns.
      if (/from public.npd_projects/.test(sql) && /current_gate/.test(sql)) {
        return { rows: [{ current_gate: 'G4', product_code: 'FG-9' }] };
      }
      if (/from public.npd_projects/.test(sql)) {
        return { rows: [{ product_code: 'FG-9', product_name: 'Test FG' }] };
      }
      if (/from public.risks/.test(sql)) {
        return { rows: [{ open_high_count: '0' }] }; // no open high risk → met
      }
      if (/from public.bom_headers/.test(sql)) {
        return { rows: [{ id: 'bom-h', line_count: '2' }] }; // active BOM with lines → met
      }
      if (/from public.factory_specs/.test(sql)) {
        return { rows: [{ id: 'spec-1' }] }; // approved spec → met
      }
      return { rows: [] };
    });

    const r = await getHandoff({ projectId: PROJECT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.releaseGates).toHaveLength(5);
    expect(r.data.releaseGates.every((g) => g.met)).toBe(true);
    expect(r.data.releaseGatesMet).toBe(true);
  });

  it('reports unmet release gates (all false) when the project resolves no product / BOM / spec', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.read'], (sql) => {
      if (/from public.handoff_checklists/.test(sql)) {
        return {
          rows: [
            {
              id: CHECKLIST,
              bom_verification_status: null,
              destination_bom_code: null,
              promote_to_production_date: null,
              destination_warehouse_id: null,
            },
          ],
        };
      }
      if (/from public.handoff_checklist_items/.test(sql)) {
        return { rows: [{ id: 'i1', label: 'Recipe locked', is_checked: true, display_order: 1 }] };
      }
      // Probe finds the project but at G1 with no product_code → every gate unmet.
      if (/from public.npd_projects/.test(sql) && /current_gate/.test(sql)) {
        return { rows: [{ current_gate: 'G1', product_code: null }] };
      }
      return { rows: [] };
    });

    const r = await getHandoff({ projectId: PROJECT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.releaseGatesMet).toBe(false);
    expect(r.data.releaseGates.find((g) => g.code === 'G4_REQUIRED')?.met).toBe(false);
    expect(r.data.releaseGates.find((g) => g.code === 'FG_CANDIDATE_REQUIRED')?.met).toBe(false);
  });

  it('qualifies the checklist select-list with hc. (guards 42702 ambiguous-column vs joined bom_headers)', async () => {
    // REGRESSION: the checklist query LEFT JOINs bom_headers, which shares columns
    // (id, org_id, created_at, notes, updated_at) with handoff_checklists. A bare
    // `select id, …` is `42702: column reference "id" is ambiguous` — a PLAN-time
    // error that dead-ended the handoff tab for EVERY at/past-handoff project. Mocked
    // clients return canned rows regardless of column ambiguity, so we assert on the
    // emitted SQL text instead (the live SQL was the real proof).
    let checklistSql = '';
    handlerHolder.handler = permHandler(['npd.handoff.read'], (sql) => {
      if (/from public\.handoff_checklists/.test(sql) && /left join public\.bom_headers/.test(sql)) {
        checklistSql = sql;
        return {
          rows: [
            { id: CHECKLIST, bom_verification_status: null, destination_bom_code: null, promote_to_production_date: null, destination_warehouse_id: null },
          ],
        };
      }
      return { rows: [] };
    });
    await getHandoff({ projectId: PROJECT });
    expect(checklistSql).not.toBe('');
    // The shared columns must be table-qualified in the SELECT list, never bare.
    expect(checklistSql).toMatch(/select\s+hc\.id\b/);
    expect(checklistSql).not.toMatch(/select\s+id\b/);
  });

  it('derives ready=false when an item is unchecked', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.read'], (sql) => {
      if (/from public.handoff_checklists/.test(sql)) {
        return {
          rows: [
            { id: CHECKLIST, bom_verification_status: null, destination_bom_code: null, promote_to_production_date: null, destination_warehouse_id: null },
          ],
        };
      }
      if (/from public.handoff_checklist_items/.test(sql)) {
        return { rows: [{ id: 'i1', label: 'Recipe locked', is_checked: false, display_order: 1 }] };
      }
      return { rows: [] };
    });
    const r = await getHandoff({ projectId: PROJECT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ready).toBe(false);
  });
});

describe('toggleHandoffChecklistItem — zod + RBAC', () => {
  it('rejects a non-uuid itemId', async () => {
    const r = await toggleHandoffChecklistItem({ projectId: PROJECT, itemId: 'x', isChecked: true });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden without npd.handoff.read', async () => {
    handlerHolder.handler = permHandler([]);
    const r = await toggleHandoffChecklistItem({ projectId: PROJECT, itemId: ITEM, isChecked: true });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('toggles + writes an audit row when granted', async () => {
    const calls: string[] = [];
    handlerHolder.handler = permHandler(['npd.handoff.read'], (sql) => {
      calls.push(sql);
      if (/update public.handoff_checklist_items/.test(sql)) {
        return { rows: [{ id: ITEM, is_checked: true }] };
      }
      return { rows: [] };
    });
    const r = await toggleHandoffChecklistItem({ projectId: PROJECT, itemId: ITEM, isChecked: true });
    expect(r).toEqual({ ok: true, data: { itemId: ITEM, isChecked: true } });
    expect(calls.some((s) => /insert into public.audit_events/.test(s))).toBe(true);
  });
});

describe('promoteToProduction — RBAC + checklist gate + release reuse', () => {
  it('returns forbidden without npd.handoff.promote (and never calls release)', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.read']); // not promote
    const r = await promoteToProduction({ projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('returns checklist_incomplete when an item is unchecked (no release call)', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.promote'], (sql) => {
      if (/from public.npd_projects/.test(sql) && /current_stage/.test(sql)) {
        return { rows: [{ current_stage: 'handoff', current_gate: 'G4' }] };
      }
      if (/from public.handoff_checklists/.test(sql)) {
        return { rows: [{ id: CHECKLIST, destination_bom_code: 'BOM-238' }] };
      }
      if (/count\(\*\) filter/.test(sql)) {
        return { rows: [{ total: 3, checked: 2 }] };
      }
      return { rows: [] };
    });
    const r = await promoteToProduction({ projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'checklist_incomplete' });
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('calls the existing release flow + records promotion when checklist complete', async () => {
    const calls: string[] = [];
    handlerHolder.handler = permHandler(['npd.handoff.promote'], (sql) => {
      calls.push(sql);
      if (/from public.npd_projects/.test(sql) && /current_stage/.test(sql)) {
        return { rows: [{ current_stage: 'handoff', current_gate: 'G4' }] };
      }
      if (/from public.handoff_checklists/.test(sql)) {
        return { rows: [{ id: CHECKLIST, destination_bom_code: 'BOM-238' }] };
      }
      if (/count\(\*\) filter/.test(sql)) {
        return { rows: [{ total: 3, checked: 3 }] };
      }
      if (/update public.handoff_checklists/.test(sql)) {
        return { rows: [{ id: CHECKLIST, promote_to_production_date: '2026-06-06' }] };
      }
      return { rows: [] };
    });
    releaseMock.mockResolvedValue({
      ok: true,
      data: { projectId: PROJECT, productCode: 'SKU-2451', activeBomHeaderId: 'bom-h-1' },
    });

    const r = await promoteToProduction({ projectId: PROJECT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(releaseMock).toHaveBeenCalledWith(PROJECT, expect.objectContaining({ client: expect.any(Object) }));
    expect(r.data.releasedToFactory).toBe(true);
    expect(r.data.destinationBomCode).toBe('bom-h-1');
    expect(r.data.promoteToProductionDate).toBe('2026-06-06');
    expect(calls.some((s) => /insert into public.audit_events/.test(s))).toBe(true);
  });

  it('records a self-service release result when no destination BOM was pre-seeded on the checklist', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.promote'], (sql) => {
      if (/from public.npd_projects/.test(sql) && /current_stage/.test(sql)) {
        return { rows: [{ current_stage: 'handoff', current_gate: 'G4' }] };
      }
      if (/from public.handoff_checklists/.test(sql)) {
        return { rows: [{ id: CHECKLIST, destination_bom_code: null }] };
      }
      if (/count\(\*\) filter/.test(sql)) {
        return { rows: [{ total: 1, checked: 1 }] };
      }
      if (/update public.handoff_checklists/.test(sql)) {
        return { rows: [{ id: CHECKLIST, promote_to_production_date: '2026-06-10' }] };
      }
      return { rows: [] };
    });
    releaseMock.mockResolvedValue({
      ok: true,
      data: {
        projectId: PROJECT,
        productCode: 'SKU-2451',
        activeBomHeaderId: 'materialized-bom-header',
        activeFactorySpecId: 'materialized-factory-spec',
      },
    });

    const r = await promoteToProduction({ projectId: PROJECT });

    expect(r).toEqual({
      ok: true,
      data: {
        projectId: PROJECT,
        destinationBomCode: 'materialized-bom-header',
        promoteToProductionDate: '2026-06-10',
        releasedToFactory: true,
      },
    });
    expect(releaseMock).toHaveBeenCalledWith(PROJECT, expect.objectContaining({ client: expect.any(Object) }));
  });

  it('rolls back and surfaces release_blocked when the release flow has preflight blockers', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.promote'], (sql) => {
      if (/from public.npd_projects/.test(sql) && /current_stage/.test(sql)) {
        return { rows: [{ current_stage: 'handoff', current_gate: 'G4' }] };
      }
      if (/from public.handoff_checklists/.test(sql)) {
        return { rows: [{ id: CHECKLIST, destination_bom_code: null }] };
      }
      if (/count\(\*\) filter/.test(sql)) {
        return { rows: [{ total: 2, checked: 2 }] };
      }
      return { rows: [] };
    });
    releaseMock.mockResolvedValue({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
      blockers: [{ code: 'bom_not_approved', message: 'BOM not approved' }],
    });

    const r = await promoteToProduction({ projectId: PROJECT });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'release_blocked' }));
    expect(transactionEvents).toContain('ROLLBACK');
    expect(transactionEvents).not.toContain('COMMIT');
  });
});
