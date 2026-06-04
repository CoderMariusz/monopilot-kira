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
