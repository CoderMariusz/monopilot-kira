import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signEvent } from '@monopilot/e-sign';

import {
  approveSpec,
  createSpec,
  deleteSpecParameter,
  getSpecDetail,
  listSpecs,
  submitSpecForReview,
  supersedeSpec,
  updateSpecParameter,
} from '../spec-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SPEC_ID = '33333333-3333-4333-8333-333333333333';
const NEXT_SPEC_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const PARAMETER_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let permissions: Set<string>;
let currentSpecStatus: 'draft' | 'under_review' | 'active' = 'under_review';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '88888888-8888-4888-8888-888888888888',
    signerUserId: USER_ID,
    intent: 'qa.spec.approve',
    subjectHash: 'c'.repeat(64),
    signedAt: '2026-06-11T12:00:00.000Z',
    auditEventId: 45,
    nonce: 'nonce-spec',
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function specRow() {
  return {
    id: SPEC_ID,
    product_id: PRODUCT_ID,
    product_code: 'FG-PIE',
    product_name: 'Steak Pie',
    spec_code: 'FG-PIE-FINAL',
    version: 2,
    status: currentSpecStatus,
    applies_to: 'all',
    approved_by: null,
    approved_at: null,
    approval_signature_hash: null,
    superseded_by: null,
    created_at: '2026-06-11T10:00:00.000Z',
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params[2]);
        const allowed = permissions.has(permission);
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }

      if (q.startsWith('select s.id::text') && q.includes('limit $3')) {
        return { rows: [specRow()], rowCount: 1 };
      }

      if (q.startsWith('select s.id::text') && q.includes('limit 1')) {
        return { rows: [specRow()], rowCount: 1 };
      }

      if (q.startsWith('select id::text, parameter_name')) {
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              parameter_name: 'Temperature',
              parameter_type: 'measurement',
              target_value: '4.0',
              min_value: '2.0',
              max_value: '6.0',
              unit: 'C',
              is_critical: true,
              sort_order: 1,
            },
            {
              id: '77777777-7777-4777-8777-777777777777',
              parameter_name: 'Appearance',
              parameter_type: 'visual',
              target_value: null,
              min_value: null,
              max_value: null,
              unit: null,
              is_critical: false,
              sort_order: 2,
            },
          ],
          rowCount: 2,
        };
      }

      if (q.startsWith('select id::text, status') && q.includes('from public.quality_specifications')) {
        return { rows: [{ id: SPEC_ID, status: currentSpecStatus }], rowCount: 1 };
      }

      if (q.startsWith('select coalesce(max(version)')) {
        return { rows: [{ next_version: 3 }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.quality_specifications')) {
        return { rows: [{ id: SPEC_ID, spec_code: 'FG-PIE-FINAL', version: params[2], status: 'draft' }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.quality_spec_parameters')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_spec_parameters')) {
        return {
          rows: [{
            id: PARAMETER_ID,
            parameter_name: params[2],
            parameter_type: params[3],
            target_value: params[4],
            min_value: params[5],
            max_value: params[6],
            unit: params[7],
            is_critical: params[8],
            sort_order: 1,
          }],
          rowCount: 1,
        };
      }

      if (q.startsWith('delete from public.quality_spec_parameters')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_specifications') && q.includes("set status = 'under_review'")) {
        currentSpecStatus = 'under_review';
        return { rows: [{ id: SPEC_ID, status: 'under_review' }], rowCount: 1 };
      }

      if (q.startsWith('select id::text, spec_code, version, status')) {
        return { rows: [{ id: SPEC_ID, spec_code: 'FG-PIE-FINAL', version: 2, status: currentSpecStatus }], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_specifications') && q.includes("set status = 'active'")) {
        currentSpecStatus = 'active';
        return { rows: [{ id: SPEC_ID, status: 'active', approval_signature_hash: 'c'.repeat(64) }], rowCount: 1 };
      }

      if (q.startsWith('update public.quality_specifications') && q.includes("set status = 'superseded'")) {
        return { rows: [{ id: SPEC_ID, status: 'superseded', superseded_by: NEXT_SPEC_ID }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('quality specification server actions', () => {
  beforeEach(() => {
    permissions = new Set(['quality.dashboard.view', 'quality.spec.approve']);
    currentSpecStatus = 'under_review';
    client = makeClient();
    vi.clearAllMocks();
  });

  it('enforces forbidden gates', async () => {
    permissions.clear();

    await expect(listSpecs()).resolves.toEqual({ ok: false, reason: 'forbidden' });
    await expect(
      createSpec({
        productId: PRODUCT_ID,
        specCode: 'FG-PIE-FINAL',
        parameters: [{ parameterName: 'Appearance', parameterType: 'visual' }],
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('creates next version per org/product/spec_code and inserts parameters in order', async () => {
    const result = await createSpec({
      productId: PRODUCT_ID,
      specCode: 'FG-PIE-FINAL',
      parameters: [
        { parameterName: 'Appearance', parameterType: 'visual', isCritical: false },
        { parameterName: 'Temperature', parameterType: 'measurement', minValue: '2.0', maxValue: '6.0', unit: 'C', isCritical: true },
      ],
    });

    expect(result).toEqual({ ok: true, data: { id: SPEC_ID, specCode: 'FG-PIE-FINAL', version: 3, status: 'draft' } });
    const specInsert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.quality_specifications'),
    );
    expect(specInsert?.[1]?.[2]).toBe(3);
    const parameterInserts = vi.mocked(client.query).mock.calls.filter(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.quality_spec_parameters'),
    );
    expect(parameterInserts.map(([, params]) => params?.[8])).toEqual([0, 1]);
    expect(parameterInserts[1]?.[1]?.[4]).toBe('2.0');
    expect(parameterInserts[1]?.[1]?.[5]).toBe('6.0');
  });

  it('returns parameters ordered by sort_order from detail reads', async () => {
    const result = await getSpecDetail(SPEC_ID);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) throw new Error('expected spec detail');
    expect(result.data.parameters.map((parameter) => parameter.parameterName)).toEqual(['Temperature', 'Appearance']);
    const paramQuery = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('select id::text, parameter_name'));
    expect(normalize(String(paramQuery?.[0]))).toContain('order by sort_order asc');
  });

  it('[SFQ-141] rejects parameter edits outside draft and resequences after draft deletion', async () => {
    currentSpecStatus = 'active';
    const update = await updateSpecParameter({
      specId: SPEC_ID,
      parameterId: PARAMETER_ID,
      parameterName: 'Temperature',
      parameterType: 'measurement',
      minValue: '2.0',
      maxValue: '6.0',
      unit: 'C',
      isCritical: true,
    });
    const removeActive = await deleteSpecParameter({ specId: SPEC_ID, parameterId: PARAMETER_ID });

    expect(update).toEqual({ ok: false, reason: 'error', message: 'spec must be draft' });
    expect(removeActive).toEqual({ ok: false, reason: 'error', message: 'spec must be draft' });
    expect(
      vi.mocked(client.query).mock.calls.some(([sql]) =>
        normalize(String(sql)).startsWith('delete from public.quality_spec_parameters'),
      ),
    ).toBe(false);

    currentSpecStatus = 'draft';
    const removeDraft = await deleteSpecParameter({ specId: SPEC_ID, parameterId: PARAMETER_ID });
    expect(removeDraft).toEqual({
      ok: true,
      data: { specId: SPEC_ID, parameterId: PARAMETER_ID },
    });
    const resequence = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('with ranked as'),
    );
    expect(normalize(String(resequence?.[0]))).toContain(
      'row_number() over (order by sort_order asc, id asc) as rn',
    );
    expect(resequence?.[1]).toEqual([SPEC_ID]);
  });

  it('submits, approves with e-sign evidence columns, and supersedes specs', async () => {
    currentSpecStatus = 'draft';
    await expect(submitSpecForReview({ specId: SPEC_ID })).resolves.toEqual({
      ok: true,
      data: { id: SPEC_ID, status: 'under_review' },
    });

    currentSpecStatus = 'under_review';
    const approved = await approveSpec({ specId: SPEC_ID, signature: { password: 'pw' } });
    expect(approved).toEqual({
      ok: true,
      data: { id: SPEC_ID, status: 'active', approvalSignatureHash: 'c'.repeat(64) },
    });
    const approveUpdate = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes("set status = 'active'"));
    expect(approveUpdate?.[1]).toEqual([SPEC_ID, USER_ID, 'c'.repeat(64)]);

    const superseded = await supersedeSpec({ specId: SPEC_ID, bySpecId: NEXT_SPEC_ID });
    expect(superseded).toEqual({ ok: true, data: { id: SPEC_ID, status: 'superseded', supersededBy: NEXT_SPEC_ID } });
  });

  it('[SFQ-142] rejects direct draft approval and signs only under_review approval', async () => {
    currentSpecStatus = 'draft';
    const direct = await approveSpec({ specId: SPEC_ID, signature: { password: 'pw' } });

    expect(direct).toEqual({
      ok: false,
      reason: 'error',
      message: 'spec must be under_review before approval',
    });
    expect(signEvent).not.toHaveBeenCalled();

    await expect(submitSpecForReview({ specId: SPEC_ID })).resolves.toEqual({
      ok: true,
      data: { id: SPEC_ID, status: 'under_review' },
    });
    const reviewed = await approveSpec({ specId: SPEC_ID, signature: { password: 'pw' } });
    expect(reviewed).toMatchObject({ ok: true, data: { status: 'active' } });
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'qa.spec.approve' }),
      { client },
    );
    expect(signEvent).toHaveBeenCalledTimes(1);
  });
});
