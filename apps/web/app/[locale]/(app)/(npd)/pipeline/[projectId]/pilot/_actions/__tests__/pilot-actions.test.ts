/**
 * NPD PILOT stage — Server Action unit tests (zod validation + RBAC + status compute).
 *
 * `withOrgContext` is mocked to run the action body against a scriptable fake
 * client so we can assert: (1) zod rejects malformed input WITHOUT touching the
 * DB, (2) the RBAC permission gate (`npd.pilot.read` / `npd.pilot.write`) is
 * enforced and returns `forbidden` when the role lacks the permission, and
 * (3) material status is recomputed server-side (reserved >= required).
 *
 * `next/cache` revalidatePath is stubbed (no Next request scope in unit tests).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Scriptable fake org-context client ────────────────────────────────────────
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

import { getPilotRun } from '../get-pilot-run';
import { upsertPilotRun } from '../upsert-pilot-run';
import { upsertPilotMaterial } from '../upsert-pilot-material';
import { togglePilotChecklistItem } from '../toggle-pilot-checklist-item';

const PROJECT = '07300000-0000-4000-8000-0000000000c1';
const RUN = '07300000-0000-4000-8000-0000000000d1';
const ITEM = '07300000-0000-4000-8000-0000000000e1';

afterEach(() => {
  handlerHolder.handler = () => ({ rows: [] });
  vi.clearAllMocks();
});

/** A permission handler that grants `granted` and denies everything else. */
function permHandler(granted: string[], rest?: Handler): Handler {
  return (sql, params) => {
    if (/role_permissions/.test(sql) && /rp.permission = \$3/.test(sql)) {
      const perm = params[2] as string;
      return { rows: granted.includes(perm) ? [{ ok: true }] : [] };
    }
    return rest ? rest(sql, params) : { rows: [] };
  };
}

describe('getPilotRun — zod', () => {
  it('rejects a non-uuid projectId without hitting the DB', async () => {
    const spy = vi.fn(() => ({ rows: [] }));
    handlerHolder.handler = spy as unknown as Handler;
    const r = await getPilotRun({ projectId: 'not-a-uuid' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('getPilotRun — RBAC', () => {
  it('returns forbidden when npd.pilot.read is missing', async () => {
    handlerHolder.handler = permHandler([]); // no perms
    const r = await getPilotRun({ projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('reads + computes short status when npd.pilot.read is granted', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.read'], (sql) => {
      if (/from public.pilot_runs/.test(sql) && /limit 1/.test(sql)) {
        return {
          rows: [
            {
              id: RUN,
              planned_date: '2025-12-20',
              line: 'Line 2',
              batch_size_kg: '500.0000',
              expected_yield_pct: '78.00',
              duration_hours: '6.00',
              supervisor_name: 'M. Johnson',
              status: 'planned',
            },
          ],
        };
      }
      if (/from public.pilot_run_materials/.test(sql)) {
        return {
          rows: [
            { id: 'm1', ingredient_code: 'Pork', required_kg: '410', available_kg: '850', reserved_kg: '410', status: 'reserved' },
            { id: 'm2', ingredient_code: 'Spice', required_kg: '4.5', available_kg: '3.2', reserved_kg: '3.2', status: 'short' },
          ],
        };
      }
      if (/from public.pilot_run_checklist_items/.test(sql)) {
        return { rows: [{ id: ITEM, label: 'Recipe approved', is_checked: true, display_order: 1 }] };
      }
      return { rows: [] };
    });

    const r = await getPilotRun({ projectId: PROJECT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.run.line).toBe('Line 2');
    expect(r.data.materials).toHaveLength(2);
    expect(r.data.materials[1]!.status).toBe('short');
    expect(r.data.materials[1]!.shortByKg).toBe('1.3000');
    expect(r.data.totalShortKg).toBe('1.3000');
    expect(r.data.checklist[0]!.isChecked).toBe(true);
  });
});

describe('upsertPilotRun — zod + RBAC', () => {
  it('rejects an out-of-range expectedYieldPct', async () => {
    const r = await upsertPilotRun({ projectId: PROJECT, expectedYieldPct: '120' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden without npd.pilot.write', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.read']); // read only
    const r = await upsertPilotRun({ projectId: PROJECT, line: 'Line 2' });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('inserts a new run + writes an audit row when npd.pilot.write is granted', async () => {
    const calls: string[] = [];
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      calls.push(sql);
      if (/from public.npd_projects/.test(sql)) return { rows: [{ id: PROJECT }] };
      if (/insert into public.pilot_runs/.test(sql)) return { rows: [{ id: RUN }] };
      return { rows: [] };
    });
    const r = await upsertPilotRun({ projectId: PROJECT, line: 'Line 2', batchSizeKg: '500' });
    expect(r).toEqual({ ok: true, data: { pilotRunId: RUN } });
    expect(calls.some((s) => /insert into public.audit_events/.test(s))).toBe(true);
  });
});

describe('upsertPilotMaterial — status compute + RBAC', () => {
  it('computes short when reserved < required', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      if (/from public.pilot_runs/.test(sql)) return { rows: [{ id: RUN }] };
      if (/into public.pilot_run_materials/.test(sql)) return { rows: [{ id: 'm9' }] };
      return { rows: [] };
    });
    const r = await upsertPilotMaterial({
      projectId: PROJECT,
      pilotRunId: RUN,
      ingredientCode: 'Spice',
      requiredKg: '4.5',
      availableKg: '3.2',
      reservedKg: '3.2',
    });
    expect(r).toEqual({ ok: true, data: { materialId: 'm9', status: 'short' } });
  });

  it('computes reserved when reserved >= required', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      if (/from public.pilot_runs/.test(sql)) return { rows: [{ id: RUN }] };
      if (/into public.pilot_run_materials/.test(sql)) return { rows: [{ id: 'm10' }] };
      return { rows: [] };
    });
    const r = await upsertPilotMaterial({
      projectId: PROJECT,
      pilotRunId: RUN,
      ingredientCode: 'Pork',
      requiredKg: '410',
      availableKg: '850',
      reservedKg: '410',
    });
    expect(r).toEqual({ ok: true, data: { materialId: 'm10', status: 'reserved' } });
  });
});

describe('togglePilotChecklistItem — zod + RBAC', () => {
  it('rejects a non-boolean isChecked', async () => {
    const r = await togglePilotChecklistItem({ projectId: PROJECT, itemId: ITEM, isChecked: 'yes' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden without npd.pilot.write', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.read']);
    const r = await togglePilotChecklistItem({ projectId: PROJECT, itemId: ITEM, isChecked: true });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('toggles + audits when granted', async () => {
    const calls: string[] = [];
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      calls.push(sql);
      if (/update public.pilot_run_checklist_items/.test(sql)) return { rows: [{ id: ITEM, is_checked: true }] };
      return { rows: [] };
    });
    const r = await togglePilotChecklistItem({ projectId: PROJECT, itemId: ITEM, isChecked: true });
    expect(r).toEqual({ ok: true, data: { itemId: ITEM, isChecked: true } });
    expect(calls.some((s) => /insert into public.audit_events/.test(s))).toBe(true);
  });
});
