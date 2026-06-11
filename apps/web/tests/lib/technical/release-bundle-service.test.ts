/**
 * T-080 — service-contract tests for the release-bundle service.
 *
 * These exercise the preflight branches that do not need a real DB (input validation +
 * the Settings authorization preflight) with a stub QueryClient, so the service contract
 * is verified fast and deterministically. The full atomic approve/reject + outbox + NPD
 * release-loop behaviour is covered against a real DB in
 * tests/actions/technical/release-bundle.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  ApproveBundleInput,
  FACTORY_SPEC_APPROVE_PERMISSION,
  RejectBundleInput,
  approveReleaseBundle,
  rejectReleaseBundle,
  type QueryClient,
} from '../../../lib/technical/release-bundle-service';

const validApprove = {
  factorySpecId: '11111111-1111-1111-1111-111111111111',
  bomHeaderId: '22222222-2222-2222-2222-222222222222',
  pin: '135790',
  reason: 'approve',
};

function noPermissionClient(): QueryClient {
  // Every query returns zero rows → the hasPermission preflight resolves false.
  return { query: vi.fn(async () => ({ rows: [] as Record<string, unknown>[] })) } as unknown as QueryClient;
}

const ctx = (client: QueryClient) => ({
  userId: '33333333-3333-3333-3333-333333333333',
  orgId: '44444444-4444-4444-4444-444444444444',
  client,
});

describe('T-080 release-bundle-service — input validation', () => {
  it('rejects a non-uuid factorySpecId with invalid_input', async () => {
    const result = await approveReleaseBundle(ctx(noPermissionClient()), { ...validApprove, factorySpecId: 'not-a-uuid' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
  });

  it('rejects a missing reason with invalid_input (CFR 21 Part 11 reason is mandatory)', async () => {
    const result = await approveReleaseBundle(ctx(noPermissionClient()), { ...validApprove, reason: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
  });

  it('schemas accept a well-formed payload', () => {
    expect(ApproveBundleInput.safeParse(validApprove).success).toBe(true);
    expect(
      RejectBundleInput.safeParse({ factorySpecId: validApprove.factorySpecId, bomHeaderId: validApprove.bomHeaderId, reason: 'no' }).success,
    ).toBe(true);
  });
});

describe('T-080 release-bundle-service — authorization preflight (AC5)', () => {
  it('approve returns forbidden when the caller lacks technical.product_spec.approve', async () => {
    const client = noPermissionClient();
    const result = await approveReleaseBundle(ctx(client), validApprove);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
  });

  it('reject returns forbidden when the caller lacks the approval permission', async () => {
    const client = noPermissionClient();
    const result = await rejectReleaseBundle(ctx(client), {
      factorySpecId: validApprove.factorySpecId,
      bomHeaderId: validApprove.bomHeaderId,
      reason: 'no perm',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
  });

  it('exposes the canonical approval permission string', () => {
    expect(FACTORY_SPEC_APPROVE_PERMISSION).toBe('technical.product_spec.approve');
  });
});

// ── F2 (W9 cross-review HIGH) — bundle-internal FG↔product consistency ─────────
// The factory_spec's fg_item_id must resolve (org-scoped) to an item whose
// item_code equals bom_headers.product_id; otherwise a spec for product A could
// be bundle-approved against product B's BOM.
describe('F2 release-bundle-service — spec.fg_item_id must match the BOM product', () => {
  const FG_ITEM_ID = '55555555-5555-4555-8555-555555555555';

  function routedClient(options: { fgMatches: boolean }): QueryClient {
    return {
      query: vi.fn(async (sql: string) => {
        const n = sql.replace(/\s+/g, ' ').toLowerCase();
        if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] };
        if (n.includes('from public.factory_specs')) {
          return {
            rows: [
              {
                id: validApprove.factorySpecId,
                fg_item_id: FG_ITEM_ID,
                status: 'in_review',
                bom_header_id: validApprove.bomHeaderId,
                bom_version: 4,
              },
            ],
          };
        }
        if (n.includes('from public.bom_headers')) {
          return {
            rows: [
              {
                id: validApprove.bomHeaderId,
                status: 'in_review',
                version: 4,
                product_id: 'FG-7001',
                npd_project_id: null,
              },
            ],
          };
        }
        // F2 consistency probe: items lookup by fg_item_id + item_code.
        if (n.includes('from public.items i') && n.includes('i.item_code = $2')) {
          return { rows: options.fgMatches ? [{ ok: true }] : [] };
        }
        // RM usability gate — report a blocked line so the positive-control run
        // stops at release_blocked (proves it got PAST the F2 gate).
        if (n.includes('count(*)::int as blocked')) return { rows: [{ blocked: 1 }] };
        throw new Error(`Unhandled SQL in F2 stub: ${n}`);
      }),
    } as unknown as QueryClient;
  }

  it('rejects with invalid_state when the spec FG item does not carry the BOM product code', async () => {
    const result = await approveReleaseBundle(ctx(routedClient({ fgMatches: false })), validApprove);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_state');
      expect(result.message).toContain(`factory_spec FG item ${FG_ITEM_ID} does not match the BOM product FG-7001`);
    }
  });

  it('proceeds past the FG↔product gate when the org-scoped items lookup confirms the match', async () => {
    const result = await approveReleaseBundle(ctx(routedClient({ fgMatches: true })), validApprove);
    expect(result.ok).toBe(false);
    // Stopped LATER, at the RM-usability blocker — i.e. the F2 gate passed.
    if (!result.ok) expect(result.error).toBe('release_blocked');
  });
});
