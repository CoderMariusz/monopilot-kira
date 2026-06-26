import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { sql: string; params: readonly unknown[] };

const ctx = {
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  grantedPerms: new Set<string>(),
  // simulate whether an UPDATE/SELECT-by-id finds an existing panel row
  panelExists: true,
  calls: [] as Call[],
};

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function fakeClient() {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      ctx.calls.push({ sql, params });
      const s = norm(sql);

      if (s.includes('from public.user_roles ur')) {
        const perm = params[2] as string;
        return { rows: ctx.grantedPerms.has(perm) ? [{ ok: true }] : [] };
      }
      if (s.startsWith('insert into public.technical_sensory_evaluations')) {
        return { rows: [{ id: 'panel-created-1' }] };
      }
      // EDIT prior-row SELECT
      if (s.startsWith('select id::text as id, subject_type, subject_ref, status')) {
        return { rows: ctx.panelExists ? [{ id: 'panel-edit-1', status: 'pending' }] : [] };
      }
      if (s.startsWith('update public.technical_sensory_evaluations')) {
        return { rows: ctx.panelExists ? [{ id: 'panel-edit-1' }] : [] };
      }
      // savepoint / audit / delete / child inserts
      return { rows: [] };
    },
  };
}

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({ orgId: ctx.orgId, userId: ctx.userId, sessionToken: 't', client: fakeClient() }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { SENSORY_WRITE_PERMISSION } from '../record-sensory-constants';
import { recordSensoryEvaluation } from '../record-sensory-evaluation';

const baseInput = {
  subjectType: 'product' as const,
  subjectRef: 'FG-001',
  status: 'pending' as const,
  attributes: [
    { attributeName: 'Appearance', scoreOutOf10: 8 },
    { attributeName: 'Aroma', scoreOutOf10: 7.5, vsBenchmark: 1.2 },
  ],
  comments: [{ panelistCode: 'P1', comment: 'Balanced' }],
};

beforeEach(() => {
  ctx.grantedPerms = new Set<string>([SENSORY_WRITE_PERMISSION]);
  ctx.panelExists = true;
  ctx.calls = [];
});
afterEach(() => vi.clearAllMocks());

describe('recordSensoryEvaluation', () => {
  it('rejects empty subjectRef / empty attribute name via zod (INVALID_INPUT)', async () => {
    expect(await recordSensoryEvaluation({ ...baseInput, subjectRef: '' })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(
      await recordSensoryEvaluation({
        ...baseInput,
        attributes: [{ attributeName: '', scoreOutOf10: 5 }],
      }),
    ).toEqual({ ok: false, code: 'INVALID_INPUT' });
    // out-of-range score
    expect(
      await recordSensoryEvaluation({
        ...baseInput,
        attributes: [{ attributeName: 'X', scoreOutOf10: 99 }],
      }),
    ).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns FORBIDDEN when the caller lacks technical.sensory.write', async () => {
    ctx.grantedPerms = new Set<string>();
    expect(await recordSensoryEvaluation(baseInput)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('CREATE: inserts a header with policy_required and returns the new panelId', async () => {
    const res = await recordSensoryEvaluation(baseInput);
    expect(res).toEqual({ ok: true, panelId: 'panel-created-1' });

    const insert = ctx.calls.find((c) =>
      norm(c.sql).startsWith('insert into public.technical_sensory_evaluations'),
    );
    expect(insert).toBeDefined();
    // policy_required is param $6 in the INSERT values list (index 5).
    expect(insert!.params[5]).toBe(true); // pending => policy_required true
    // pending is NOT a verdict → evaluated_at/by are inlined as null (no now()).
    expect(norm(insert!.sql)).not.toContain('now()');
  });

  it("status='not_required' forces policy_required=false", async () => {
    const res = await recordSensoryEvaluation({ ...baseInput, status: 'not_required' });
    expect(res.ok).toBe(true);
    const insert = ctx.calls.find((c) =>
      norm(c.sql).startsWith('insert into public.technical_sensory_evaluations'),
    )!;
    expect(insert.params[5]).toBe(false); // policy_required forced false
  });

  it("status='pass' stamps evaluated_at=now()/evaluated_by (verdict)", async () => {
    const res = await recordSensoryEvaluation({ ...baseInput, status: 'pass' });
    expect(res.ok).toBe(true);
    const insert = ctx.calls.find((c) =>
      norm(c.sql).startsWith('insert into public.technical_sensory_evaluations'),
    )!;
    expect(norm(insert.sql)).toContain('now()'); // verdict → evaluated_at = now()
    // evaluated_by uses the userId param ($7 / index 6).
    expect(insert.params[6]).toBe(ctx.userId);
  });

  it('replace semantics: deletes then re-inserts each attribute + comment with display_order = index', async () => {
    const res = await recordSensoryEvaluation(baseInput);
    expect(res.ok).toBe(true);

    const attrDelete = ctx.calls.find((c) =>
      norm(c.sql).startsWith('delete from public.technical_sensory_attribute_scores'),
    );
    const commentDelete = ctx.calls.find((c) =>
      norm(c.sql).startsWith('delete from public.technical_sensory_panelist_comments'),
    );
    expect(attrDelete).toBeDefined();
    expect(commentDelete).toBeDefined();

    const attrInserts = ctx.calls.filter((c) =>
      norm(c.sql).startsWith('insert into public.technical_sensory_attribute_scores'),
    );
    expect(attrInserts).toHaveLength(2);
    // display_order param ($5 / index 4) equals the row index.
    expect(attrInserts[0]!.params[4]).toBe(0);
    expect(attrInserts[1]!.params[4]).toBe(1);
    // attribute_name carried verbatim.
    expect(attrInserts[0]!.params[1]).toBe('Appearance');

    const commentInserts = ctx.calls.filter((c) =>
      norm(c.sql).startsWith('insert into public.technical_sensory_panelist_comments'),
    );
    expect(commentInserts).toHaveLength(1);
    // comment INSERT params: $1 panel_id, $2 panelist_code, $3 comment, $4 display_order
    expect(commentInserts[0]!.params[1]).toBe('P1'); // panelist_code
    expect(commentInserts[0]!.params[2]).toBe('Balanced'); // comment text
    expect(commentInserts[0]!.params[3]).toBe(0); // display_order = index
  });

  it('EDIT: panelId present → UPDATE path; missing row → NOT_FOUND', async () => {
    const ok = await recordSensoryEvaluation({
      ...baseInput,
      panelId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(ok).toEqual({ ok: true, panelId: 'panel-edit-1' });
    expect(
      ctx.calls.some((c) => norm(c.sql).startsWith('update public.technical_sensory_evaluations')),
    ).toBe(true);

    ctx.panelExists = false;
    ctx.calls = [];
    const missing = await recordSensoryEvaluation({
      ...baseInput,
      panelId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(missing).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('writes a technical.sensory.recorded audit event (best-effort, in a SAVEPOINT)', async () => {
    await recordSensoryEvaluation(baseInput);
    const audit = ctx.calls.find((c) => norm(c.sql).includes('insert into public.audit_events'));
    expect(audit).toBeDefined();
    expect(norm(audit!.sql)).toContain("'technical.sensory.recorded'");
    expect(ctx.calls.some((c) => norm(c.sql) === 'savepoint sensory_audit')).toBe(true);
  });
});
