/**
 * Unit tests for the e-sign login-password fallback (live D-4, 2026-06-10).
 *
 * verifyPin is module-mocked; the pg client is a fake routed by SQL substring;
 * fetch is stubbed. Covers: no-PIN signer + valid password → signs; no-PIN
 * signer + wrong password → EPinFailedError; enrolled-PIN signer NEVER falls
 * back; 'locked' never falls back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EPinFailedError } from '../types.js';

const verifyPinMock = vi.fn();
vi.mock('@monopilot/auth/src/verify-pin.js', () => ({
  verifyPin: (...args: unknown[]) => verifyPinMock(...args),
}));

const { signEvent } = await import('../index.js');

type Row = Record<string, unknown>;

function makeClient(opts: { pinEnrolled: boolean }) {
  return {
    query: vi.fn(async (sql: string): Promise<{ rows: Row[] }> => {
      if (sql.includes('from public.user_pins')) {
        return { rows: opts.pinEnrolled ? [{ ok: true }] : [] };
      }
      if (sql.includes('from public.users')) {
        return { rows: [{ email: 'signer@test.local' }] };
      }
      if (sql.includes('from public.e_sign_log') && sql.includes('exists')) {
        return { rows: [{ exists: false }] };
      }
      if (sql.includes('app.current_org_id()')) {
        return { rows: [{ org_id: '00000000-0000-4000-c000-000000000999' }] };
      }
      if (sql.includes('insert into public.e_sign_log')) {
        return { rows: [{ signature_id: 'sig-1', created_at: new Date('2026-06-10T00:00:00Z') }] };
      }
      if (sql.includes('insert into public.audit_events')) {
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    }),
  };
}

const SIGNER = '00000000-0000-4000-a000-000000000777';

const INPUT = {
  signerUserId: SIGNER,
  pin: 'Login-Password-1!',
  intent: 'npd.gate.approved',
  subject: { projectId: 'p1', gateCode: 'G4' },
  nonce: 'unit-test-nonce',
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://unit.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  verifyPinMock.mockReset();
});

describe('e-sign login-password fallback', () => {
  it('signs when the signer has NO enrolled PIN and the login password verifies', async () => {
    verifyPinMock.mockResolvedValue(false);
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: false });
    const receipt = await signEvent(INPUT, { client: client as never });

    expect(receipt.signatureId).toBe('sig-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://unit.supabase.co/auth/v1/token?grant_type=password');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'signer@test.local',
      password: 'Login-Password-1!',
    });
  });

  it('rejects when the signer has NO enrolled PIN and the password does not verify', async () => {
    verifyPinMock.mockResolvedValue(false);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    const client = makeClient({ pinEnrolled: false });
    await expect(signEvent(INPUT, { client: client as never })).rejects.toBeInstanceOf(
      EPinFailedError,
    );
  });

  it('NEVER falls back when a PIN is enrolled — a wrong PIN stays a failure', async () => {
    verifyPinMock.mockResolvedValue(false);
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: true });
    await expect(signEvent(INPUT, { client: client as never })).rejects.toBeInstanceOf(
      EPinFailedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NEVER falls back when the PIN account is 'locked'", async () => {
    verifyPinMock.mockResolvedValue('locked');
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: false });
    await expect(signEvent(INPUT, { client: client as never })).rejects.toBeInstanceOf(
      EPinFailedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still signs directly when the PIN verifies (fallback untouched)', async () => {
    verifyPinMock.mockResolvedValue(true);
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: true });
    const receipt = await signEvent(INPUT, { client: client as never });
    expect(receipt.signatureId).toBe('sig-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
