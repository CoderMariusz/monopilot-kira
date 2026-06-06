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

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '07300000-0000-4000-8000-0000000000aa',
      orgId: '07300000-0000-4000-8000-00000000000a',
      sessionToken: 'tok',
      client: {
        query: async (sql: string, params: readonly unknown[] = []) =>
          handlerHolder.handler(sql, params) ?? { rows: [] },
      },
    }),
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
    expect(releaseMock).toHaveBeenCalledWith(PROJECT);
    expect(r.data.releasedToFactory).toBe(true);
    expect(r.data.destinationBomCode).toBe('bom-h-1');
    expect(r.data.promoteToProductionDate).toBe('2026-06-06');
    expect(calls.some((s) => /insert into public.audit_events/.test(s))).toBe(true);
  });

  it('surfaces release_blocked honestly when the release flow has preflight blockers (no fake BOM)', async () => {
    handlerHolder.handler = permHandler(['npd.handoff.promote'], (sql) => {
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
      blockers: [{ code: 'G4_REQUIRED', message: 'G4 required' }],
    });

    const r = await promoteToProduction({ projectId: PROJECT });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'release_blocked' }));
  });
});
