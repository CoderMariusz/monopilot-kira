import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectQualitySignoff } from '../quality-signoff';

const FIRST_USER_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_USER_ID = '22222222-2222-4222-8222-222222222222';
const FIRST_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_ROLE_ID = '44444444-4444-4444-8444-444444444444';
const SUBJECT_HASH = 'a'.repeat(64);

type SignatureRow = {
  signature_id: string;
  signer_user_id: string;
  signer_display_name: string;
  subject_hash: string;
  created_at: string;
  intent: string;
};

const state = vi.hoisted(() => ({
  requiredSignatures: 1,
  deniedMode: null as 'dual-primary' | 'dual-secondary' | null,
  signatures: [] as SignatureRow[],
  writeCount: 0,
}));

vi.mock('@monopilot/e-sign', () => {
  class ESignPolicyError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  class ESignSoDError extends Error {}

  return {
    ESignPolicyError,
    ESignSoDError,
    hashESignSubject: vi.fn(() => SUBJECT_HASH),
    readSignoffPolicy: vi.fn(async () => ({
      signoffType: 'qa.ncr.close',
      requiredSignatures: state.requiredSignatures,
      firstSignerRoleId: FIRST_ROLE_ID,
      secondSignerRoleId: SECOND_ROLE_ID,
      allowSameUser: false,
    })),
    signEvent: vi.fn(async (
      input: { signerUserId: string; intent: string },
      options: { policyMode?: 'single' | 'dual-primary' | 'dual-secondary' },
    ) => {
      const mode = options.policyMode ?? 'single';
      if (state.deniedMode === mode) {
        throw new ESignPolicyError('signer_role_not_allowed');
      }
      state.writeCount += 1;
      const signatureId = `${state.writeCount}`.padStart(8, '0') + '-0000-4000-8000-000000000000';
      const signedAt = `2026-07-30T10:0${state.writeCount}:00.000Z`;
      state.signatures.push({
        signature_id: signatureId,
        signer_user_id: input.signerUserId,
        signer_display_name: input.signerUserId === FIRST_USER_ID ? 'Quality Lead' : 'Production Manager',
        subject_hash: SUBJECT_HASH,
        created_at: signedAt,
        intent: input.intent,
      });
      return {
        signatureId,
        signerUserId: input.signerUserId,
        intent: input.intent,
        subjectHash: SUBJECT_HASH,
        signedAt,
        auditEventId: state.writeCount,
        nonce: `nonce-${state.writeCount}`,
      };
    }),
  };
});

const client = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from public.e_sign_log es')) {
      const intent = String(params[0]);
      const lookup = String(params[1]);
      const byId = normalized.includes('es.signature_id =');
      const row = state.signatures.find(
        (signature) =>
          signature.intent === intent
          && (byId ? signature.signature_id === lookup : signature.subject_hash === lookup),
      );
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (normalized.includes('from public.users')) {
      const userId = String(params[0]);
      return {
        rows: [{
          display_name: userId === FIRST_USER_ID ? 'Quality Lead' : 'Production Manager',
        }],
        rowCount: 1,
      };
    }
    if (normalized.includes('from public.roles')) {
      return { rows: [{ display_name: 'Production Manager' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

const subject = { ncrId: '55555555-5555-4555-8555-555555555555', resolution: 'Accepted' };
const INTENTS = [
  'qa.ncr.close',
  'qa.hold.release',
  'qa.haccp.ccp.deviation',
] as const;

describe('quality sequential sign-off', () => {
  beforeEach(() => {
    state.requiredSignatures = 1;
    state.deniedMode = null;
    state.signatures = [];
    state.writeCount = 0;
    vi.clearAllMocks();
  });

  it.each(INTENTS)('%s: required=1 completes with one signature', async (intent) => {
    const result = await collectQualitySignoff({
      client,
      signerUserId: FIRST_USER_ID,
      pin: 'first-secret',
      intent,
      subject,
      reason: 'Accepted',
    });

    expect(result.complete).toBe(true);
    expect(state.writeCount).toBe(1);
    const { signEvent } = await import('@monopilot/e-sign');
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({ signerUserId: FIRST_USER_ID }),
      expect.objectContaining({ policyMode: 'single' }),
    );
  });

  it.each(INTENTS)(
    '%s: required=2 waits, rejects the same person, and completes for another',
    async (intent) => {
      state.requiredSignatures = 2;

      const first = await collectQualitySignoff({
        client,
        signerUserId: FIRST_USER_ID,
        pin: 'first-secret',
        intent,
        subject,
        reason: 'Accepted',
      });
      expect(first).toMatchObject({
        complete: false,
        pendingSignoff: {
          state: 'pending_second_signature',
          firstSigner: { id: FIRST_USER_ID, displayName: 'Quality Lead' },
          awaitingRole: { id: SECOND_ROLE_ID, displayName: 'Production Manager' },
        },
      });
      expect(state.writeCount).toBe(1);

      await expect(
        collectQualitySignoff({
          client,
          signerUserId: FIRST_USER_ID,
          pin: 'same-person-secret',
          intent,
          subject,
          reason: 'Accepted',
          pending: { subjectHash: SUBJECT_HASH },
        }),
      ).rejects.toThrow('different user');
      expect(state.writeCount).toBe(1);

      const second = await collectQualitySignoff({
        client,
        signerUserId: SECOND_USER_ID,
        pin: 'second-secret',
        intent,
        subject,
        reason: 'Accepted',
        pending: { subjectHash: SUBJECT_HASH },
      });
      expect(second).toMatchObject({
        complete: true,
        firstSignature: { signerUserId: FIRST_USER_ID },
        receipt: { signerUserId: SECOND_USER_ID },
      });
      expect(state.writeCount).toBe(2);
      const { signEvent } = await import('@monopilot/e-sign');
      expect(signEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ signerUserId: SECOND_USER_ID }),
        expect.objectContaining({ policyMode: 'dual-secondary' }),
      );
    },
  );

  it.each(INTENTS)('%s: rejects a signer without the slot role before any write', async (intent) => {
    state.requiredSignatures = 2;
    state.deniedMode = 'dual-primary';

    await expect(
      collectQualitySignoff({
        client,
        signerUserId: FIRST_USER_ID,
        pin: 'first-secret',
        intent,
        subject,
        reason: 'Accepted',
      }),
    ).rejects.toMatchObject({ code: 'signer_role_not_allowed' });
    expect(state.writeCount).toBe(0);
    expect(state.signatures).toHaveLength(0);
  });
});
