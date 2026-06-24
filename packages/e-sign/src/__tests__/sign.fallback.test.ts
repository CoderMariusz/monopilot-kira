/**
 * Unit tests for the e-sign password-or-PIN credential resolver.
 *
 * verifyPin is module-mocked; the pg client is a fake routed by SQL substring;
 * fetch is stubbed. Covers: enrolled-PIN signer + valid password → signs,
 * wrong password + wrong PIN → EPinFailedError, and direct PIN success.
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

describe('e-sign password-or-PIN credential resolver', () => {
  it('signs when a PIN-enrolled signer supplies a valid login password', async () => {
    verifyPinMock.mockResolvedValue(false);
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: true });
    const receipt = await signEvent(INPUT, { client: client as never });

    expect(receipt.signatureId).toBe('sig-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifyPinMock).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://unit.supabase.co/auth/v1/token?grant_type=password');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'signer@test.local',
      password: 'Login-Password-1!',
    });
  });

  it('rejects when the supplied credential is neither a valid password nor a valid PIN', async () => {
    verifyPinMock.mockResolvedValue(false);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    const client = makeClient({ pinEnrolled: true });
    // A realistic PIN is 4-8 digits; password fails (fetch ok:false), so the
    // numeric secret falls through to verifyPin (which also rejects it).
    await expect(
      signEvent({ ...INPUT, pin: '1234' }, { client: client as never }),
    ).rejects.toBeInstanceOf(EPinFailedError);
    expect(verifyPinMock).toHaveBeenCalledWith(SIGNER, '1234', { client });
  });

  it("accepts a valid login password without consulting a 'locked' PIN row", async () => {
    verifyPinMock.mockResolvedValue('locked');
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: true });
    const receipt = await signEvent(INPUT, { client: client as never });
    expect(receipt.signatureId).toBe('sig-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifyPinMock).not.toHaveBeenCalled();
  });

  it('still signs when the password check fails but the PIN verifies', async () => {
    verifyPinMock.mockResolvedValue(true);
    const fetchMock = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ pinEnrolled: true });
    // Signer types their numeric PIN; the password grant fails, so the PIN
    // fallback verifies it (4-8 digit format gate lets it through).
    const receipt = await signEvent({ ...INPUT, pin: '1234' }, { client: client as never });
    expect(receipt.signatureId).toBe('sig-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifyPinMock).toHaveBeenCalledWith(SIGNER, '1234', { client });
  });
});
