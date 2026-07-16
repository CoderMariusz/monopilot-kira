import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as bomShared from '../../../app/[locale]/(app)/(modules)/technical/bom/_actions/shared';
import { approveReleaseBundle, type QueryClient } from '../release-bundle-service';

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({ signatureId: '99999999-9999-4999-8999-999999999999' })),
  hashESignSubject: vi.fn(() => 'bundle-subject-hash'),
}));

const FACTORY_SPEC_ID = '11111111-1111-4111-8111-111111111111';
const BOM_HEADER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '55555555-5555-4555-8555-555555555555';

const approveInput = {
  factorySpecId: FACTORY_SPEC_ID,
  bomHeaderId: BOM_HEADER_ID,
  pin: '135790',
  reason: 'factory release',
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createClient() {
  const client: QueryClient = {
    async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[] };
      if (n.includes('from public.org_authorization_policies')) {
        return {
          rows: [
            {
              policy_code: 'technical_product_spec_approval',
              is_enabled: true,
              min_approvers: 1,
              settings_json: { require_dual_sign_off: false },
              approver_role_codes: ['technical_manager'],
              approval_gate_rule_code: 'technical_product_spec_approval_gate_v1',
            },
          ] as T[],
        };
      }
      if (n.includes('from public.rule_definitions')) {
        return { rows: [{ rule_code: 'technical_product_spec_approval_gate_v1' }] as T[] };
      }
      if (n.includes('from public.e_sign_log') && n.includes('exists')) {
        return { rows: [{ exists: false }] as T[] };
      }
      if (n.includes('from public.e_sign_log') && n.includes('count(distinct signer_user_id)')) {
        return { rows: [{ n: 1 }] as T[] };
      }
      if (n.includes('from public.factory_specs')) {
        return {
          rows: [
            {
              id: FACTORY_SPEC_ID,
              fg_item_id: FG_ITEM_ID,
              status: 'in_review',
              bom_header_id: BOM_HEADER_ID,
              bom_version: 7,
            },
          ] as T[],
        };
      }
      if (n.includes('from public.bom_headers')) {
        return {
          rows: [
            {
              id: BOM_HEADER_ID,
              status: 'draft',
              version: 7,
              product_id: 'FG-5101',
              npd_project_id: null,
            },
          ] as T[],
        };
      }
      if (n.includes('from public.bom_lines') && n.includes('count(*)::int as blocked')) {
        return { rows: [{ blocked: 0 }] as T[] };
      }
      if (n.includes('from public.bom_lines') && n.includes('component_code')) {
        return {
          rows: [{ item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', component_code: 'WIP-001' }] as T[],
        };
      }
      if (n.includes('from public.items i') && n.includes('i.item_code = $2')) {
        return { rows: [{ ok: true }] as T[] };
      }

      throw new Error(`Unhandled SQL: ${n} params=${JSON.stringify(params)}`);
    },
  };

  return client;
}

describe('C043 — approveReleaseBundle BOM sourcing gate', () => {
  beforeEach(() => {
    vi.mocked(signEvent).mockClear();
    vi.restoreAllMocks();
  });

  it('rejects with release_blocked before e-sign when component sourcing fails', async () => {
    const guardSpy = vi.spyOn(bomShared, 'validateBomApprovalGuards').mockResolvedValue({
      ok: false,
      code: 'V-TEC-14',
      message: 'WIP-001: SUPPLIER_NOT_APPROVED, SUPPLIER_SPEC_NOT_ACTIVE',
    });

    const result = await approveReleaseBundle(
      { userId: USER_ID, orgId: ORG_ID, client: createClient() },
      approveInput,
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'release_blocked',
      message: 'WIP-001: SUPPLIER_NOT_APPROVED, SUPPLIER_SPEC_NOT_ACTIVE',
    });
    expect(vi.mocked(signEvent)).not.toHaveBeenCalled();
    expect(guardSpy).toHaveBeenCalledWith(
      expect.anything(),
      'FG-5101',
      [{ itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', componentCode: 'WIP-001' }],
      expect.objectContaining({ cycleBlockedMessage: expect.stringContaining('cycle') }),
    );
  });
});
