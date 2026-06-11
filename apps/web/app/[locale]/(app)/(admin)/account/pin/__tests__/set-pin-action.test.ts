/**
 * W9-L7 — setEsignPinAction / readPinStatus unit tests (node env).
 *
 * The action must reuse the EXACT scanner write path (`setPin` from
 * lib/scanner/auth → @monopilot/auth verify-pin) and NEVER write user_pins
 * itself — lockout-field handling lives inside setPin. Mocks mirror the
 * signoff-actions test conventions (literal specifiers the SUT imports).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  _withOrgContextRunner,
  _setPin,
  _verifyPin,
  _verifySupabaseLoginPassword,
  _writeScannerAudit,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _setPin: vi.fn(),
  _verifyPin: vi.fn(),
  _verifySupabaseLoginPassword: vi.fn(),
  _writeScannerAudit: vi.fn(),
}));

// Mock both relative depths (the SUT's literal 6-up specifier and the
// test-file-relative 7-up path) — same convention as signoff-actions.test.ts.
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));
vi.mock('../../../../../../lib/scanner/auth', () => ({
  setPin: _setPin,
  verifyPin: _verifyPin,
  verifySupabaseLoginPassword: _verifySupabaseLoginPassword,
}));
vi.mock('../../../../../../../lib/scanner/auth', () => ({
  setPin: _setPin,
  verifyPin: _verifyPin,
  verifySupabaseLoginPassword: _verifySupabaseLoginPassword,
}));
vi.mock('../../../../../../lib/scanner/audit', () => ({
  writeScannerAudit: _writeScannerAudit,
}));
vi.mock('../../../../../../../lib/scanner/audit', () => ({
  writeScannerAudit: _writeScannerAudit,
}));
// route-utils imports next/server — stub with the REAL validPin rule (4–6 digits)
// so the action's format gate is exercised without dragging Next into node env.
vi.mock('../../../../../../lib/scanner/route-utils', () => ({
  validPin: (pin: string) => /^\d{4,6}$/.test(pin),
}));
vi.mock('../../../../../../../lib/scanner/route-utils', () => ({
  validPin: (pin: string) => /^\d{4,6}$/.test(pin),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'operator@monopilot.test';

type QueryCall = { sql: string; params: unknown[] };

function makeClient(emailRows: unknown[] = [{ email: EMAIL }], pinRows: unknown[] = []) {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params: [...params] });
      if (sql.includes('from public.users')) return { rows: emailRows, rowCount: emailRows.length };
      if (sql.includes('from public.user_pins')) return { rows: pinRows, rowCount: pinRows.length };
      return { rows: [], rowCount: 0 };
    }),
  };
}

let client: ReturnType<typeof makeClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
  _setPin.mockResolvedValue(undefined);
  _verifyPin.mockResolvedValue(true);
  _verifySupabaseLoginPassword.mockResolvedValue(true);
  _writeScannerAudit.mockResolvedValue(undefined);
});

async function loadActions() {
  return import('../pin-data');
}

describe('setEsignPinAction', () => {
  it('sets the PIN via the shared scanner write path when authorized by account password', async () => {
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'password',
      currentSecret: 'Admin2026!!!',
      newPin: '4711',
      confirmPin: '4711',
    });

    expect(result).toEqual({ ok: true, pinSet: true });
    expect(_verifySupabaseLoginPassword).toHaveBeenCalledWith(EMAIL, 'Admin2026!!!');
    // EXACT scanner write path, once, with the verified caller's id.
    expect(_setPin).toHaveBeenCalledTimes(1);
    expect(_setPin).toHaveBeenCalledWith(USER_ID, '4711');
    expect(_verifyPin).not.toHaveBeenCalled();
    expect(_writeScannerAudit).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ orgId: ORG_ID, userId: USER_ID, operation: 'account.set_pin', resultCode: 'ok' }),
    );
    // The ACTION never writes user_pins itself — lockout fields belong to setPin.
    const pinWrites = client.calls.filter(
      (c) => /user_pins/i.test(c.sql) && /(insert|update|delete)/i.test(c.sql),
    );
    expect(pinWrites).toEqual([]);
  });

  it('changes the PIN when authorized by the current PIN (verifyPin true)', async () => {
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'pin',
      currentSecret: '1234',
      newPin: '987654',
      confirmPin: '987654',
    });

    expect(result).toEqual({ ok: true, pinSet: true });
    expect(_verifyPin).toHaveBeenCalledWith(USER_ID, '1234', { client });
    expect(_setPin).toHaveBeenCalledWith(USER_ID, '987654');
    expect(_verifySupabaseLoginPassword).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password without writing the PIN', async () => {
    _verifySupabaseLoginPassword.mockResolvedValue(false);
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'password',
      currentSecret: 'wrong-password',
      newPin: '4711',
      confirmPin: '4711',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(_setPin).not.toHaveBeenCalled();
    expect(_writeScannerAudit).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ operation: 'account.set_pin', resultCode: 'invalid_credentials' }),
    );
  });

  it('rejects a wrong current PIN without writing the PIN', async () => {
    _verifyPin.mockResolvedValue(false);
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'pin',
      currentSecret: '0000',
      newPin: '4711',
      confirmPin: '4711',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(_setPin).not.toHaveBeenCalled();
  });

  it("surfaces 'locked' from verifyPin as pin_locked and never bypasses the lockout", async () => {
    _verifyPin.mockResolvedValue('locked');
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'pin',
      currentSecret: '1234',
      newPin: '4711',
      confirmPin: '4711',
    });

    expect(result).toEqual({ ok: false, error: 'pin_locked' });
    expect(_setPin).not.toHaveBeenCalled();
    expect(_writeScannerAudit).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ resultCode: 'pin_locked' }),
    );
  });

  it.each([
    ['too short', '123'],
    ['too long', '1234567'],
    ['non-numeric', '12ab'],
  ])('rejects a weak PIN (%s) before any auth or DB work', async (_name, weakPin) => {
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'password',
      currentSecret: 'Admin2026!!!',
      newPin: weakPin,
      confirmPin: weakPin,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_pin_format' });
    expect(_withOrgContextRunner).not.toHaveBeenCalled();
    expect(_setPin).not.toHaveBeenCalled();
  });

  it('rejects mismatched PIN entries before any auth or DB work', async () => {
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'password',
      currentSecret: 'Admin2026!!!',
      newPin: '4711',
      confirmPin: '4712',
    });

    expect(result).toEqual({ ok: false, error: 'pin_mismatch' });
    expect(_withOrgContextRunner).not.toHaveBeenCalled();
    expect(_setPin).not.toHaveBeenCalled();
  });

  it('maps a thrown context/DB failure to persistence_failed', async () => {
    _withOrgContextRunner.mockRejectedValue(new Error('boom'));
    const { setEsignPinAction } = await loadActions();

    const result = await setEsignPinAction({
      authMethod: 'password',
      currentSecret: 'Admin2026!!!',
      newPin: '4711',
      confirmPin: '4711',
    });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
  });
});

describe('readPinStatus', () => {
  it('reports pinSet=false with clean lockout fields when no user_pins row exists', async () => {
    const { readPinStatus } = await loadActions();

    const status = await readPinStatus();

    expect(status).toEqual({
      state: 'ready',
      pinSet: false,
      lockedUntil: null,
      failedAttempts: 0,
      updatedAt: null,
    });
  });

  it('reports pinSet=true, attempts and an ACTIVE lock only while locked_until is in the future', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    client = makeClient(
      [{ email: EMAIL }],
      [{ attempts_count: 3, locked_until: future, updated_at: new Date('2026-06-11T08:00:00Z') }],
    );
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { readPinStatus } = await loadActions();

    const status = await readPinStatus();

    expect(status.pinSet).toBe(true);
    expect(status.failedAttempts).toBe(3);
    expect(status.lockedUntil).toBe(future.toISOString());
    expect(status.updatedAt).toBe('2026-06-11T08:00:00.000Z');
  });

  it('treats an expired locked_until as not locked', async () => {
    const past = new Date(Date.now() - 60 * 1000);
    client = makeClient([{ email: EMAIL }], [{ attempts_count: 6, locked_until: past, updated_at: null }]);
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { readPinStatus } = await loadActions();

    const status = await readPinStatus();

    expect(status.pinSet).toBe(true);
    expect(status.lockedUntil).toBeNull();
  });
});
