import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * cloneProject unit tests — withOrgContext is mocked so the action runs against a
 * scripted query mock (no DB). Asserts the RBAC gate, NOT_FOUND on a missing source,
 * input validation, and the cloned-insert / checklist-copy / outbox SQL + params.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: { query: queryMock } }),
}));

const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const NEW_ID = '99999999-9999-4999-8999-999999999999';

function sourceRow() {
  return {
    code: 'NPD-001',
    name: 'Sliced Ham Standard',
    type: 'Meat · Cold cut',
    prio: 'high',
    owner: 'Core Team',
    target_launch: '2026-09-15',
    notes: 'origin notes',
    pack_format: '200g sliced',
    sales_channel: 'Retail',
    expected_volume: '1200 kg/week',
    target_retail_price_eur: '19.90',
    target_audience: 'Premium retail',
    marketing_claims: 'High protein',
    constraints: 'Shelf life >= 28d',
    pack_weight_g: '200.000',
  };
}

describe('cloneProject', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('rejects a missing/blank sourceProjectId before any query (INVALID_INPUT)', async () => {
    const { cloneProject } = await import('../clone-project');
    await expect(cloneProject({})).resolves.toEqual({ ok: false, error: 'INVALID_INPUT' });
    await expect(cloneProject({ sourceProjectId: '   ' })).resolves.toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when the caller lacks npd.project.create', async () => {
    const { cloneProject } = await import('../clone-project');
    queryMock.mockResolvedValueOnce({ rows: [] }); // hasPermission → none
    await expect(cloneProject({ sourceProjectId: SOURCE_ID })).resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('returns NOT_FOUND when the source project is not in the caller org', async () => {
    const { cloneProject } = await import('../clone-project');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] }) // hasPermission
      .mockResolvedValueOnce({ rows: [] }); // load source → none
    await expect(cloneProject({ sourceProjectId: SOURCE_ID })).resolves.toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('clones the source header (name suffixed "(copy)"), copies checklist items, and writes the created outbox event', async () => {
    const { cloneProject } = await import('../clone-project');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] }) // hasPermission
      .mockResolvedValueOnce({ rows: [sourceRow()] }) // load source
      .mockResolvedValueOnce({ rows: [{ next_value: '7' }] }) // allocate: seq bump
      .mockResolvedValueOnce({ rows: [] }) // allocate: code-collision check (none)
      .mockResolvedValueOnce({ rows: [{ id: NEW_ID, code: 'NPD-007' }] }) // insert clone
      .mockResolvedValueOnce({ rows: [{ cloned_count: '5' }] }) // copy checklist
      .mockResolvedValueOnce({ rows: [] }); // outbox insert

    const result = await cloneProject({ sourceProjectId: SOURCE_ID });

    expect(result).toEqual({
      ok: true,
      data: {
        id: NEW_ID,
        code: 'NPD-007',
        checklistItemsCloned: 5,
        sourceCode: 'NPD-001',
        outboxEventType: 'npd.project.created',
      },
    });

    // The clone INSERT resets gate/stage to G0/brief, sets start_from='clone',
    // clone_source=<source code>, and the name defaults to "<source> (copy)".
    const insertCall = queryMock.mock.calls[4]!;
    const insertSql = String(insertCall[0]);
    expect(insertSql).toContain('insert into public.npd_projects');
    expect(insertSql).toContain("'G0', 'brief', 'clone'");
    const insertParams = insertCall[1] as unknown[];
    expect(insertParams[0]).toBe(ORG_ID);
    expect(insertParams[1]).toBe('NPD-007'); // fresh code
    expect(insertParams[2]).toBe('Sliced Ham Standard (copy)'); // name suffixed
    expect(insertParams[3]).toBe('Meat · Cold cut'); // type carried
    expect(insertParams[4]).toBe('high'); // prio carried
    expect(insertParams[16]).toBe('NPD-001'); // clone_source = source code
    expect(insertParams[17]).toBe(USER_ID); // created_by_user

    // The checklist copy is scoped to the source project and the caller org.
    const checklistSql = String(queryMock.mock.calls[5]![0]);
    expect(checklistSql).toContain('insert into public.gate_checklist_items');
    expect(checklistSql).toContain('from public.gate_checklist_items src');
    expect(queryMock.mock.calls[5]![1]).toEqual([NEW_ID, SOURCE_ID]);

    // The outbox event is the same created event, tagged with the clone lineage.
    const outboxCall = queryMock.mock.calls[6]!;
    expect(String(outboxCall[0])).toContain('insert into public.outbox_events');
    const payload = JSON.parse(String((outboxCall[1] as unknown[])[3]));
    expect(payload).toMatchObject({
      org_id: ORG_ID,
      actor_user_id: USER_ID,
      project_id: NEW_ID,
      code: 'NPD-007',
      cloned_from_project_id: SOURCE_ID,
      cloned_from_code: 'NPD-001',
      checklist_items_seeded: 5,
    });
  });

  it('applies wizard overrides (name/prio) instead of the source header', async () => {
    const { cloneProject } = await import('../clone-project');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] }) // hasPermission
      .mockResolvedValueOnce({ rows: [sourceRow()] }) // load source
      .mockResolvedValueOnce({ rows: [{ next_value: '8' }] }) // seq
      .mockResolvedValueOnce({ rows: [] }) // collision check
      .mockResolvedValueOnce({ rows: [{ id: NEW_ID, code: 'NPD-008' }] }) // insert
      .mockResolvedValueOnce({ rows: [{ cloned_count: '0' }] }) // checklist copy
      .mockResolvedValueOnce({ rows: [] }); // outbox

    const result = await cloneProject({
      sourceProjectId: SOURCE_ID,
      overrides: { name: 'Brand New Name', prio: 'low', targetRetailPriceEur: 25 },
    });

    expect(result.ok).toBe(true);
    const insertParams = queryMock.mock.calls[4]![1] as unknown[];
    expect(insertParams[2]).toBe('Brand New Name'); // override name (no "(copy)")
    expect(insertParams[4]).toBe('low'); // override prio
    expect(insertParams[11]).toBe(25); // override target_retail_price_eur
  });

  it('rejects an over-length override before any query (INVALID_INPUT)', async () => {
    const { cloneProject } = await import('../clone-project');
    const result = await cloneProject({
      sourceProjectId: SOURCE_ID,
      overrides: { name: 'x'.repeat(161) },
    });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
