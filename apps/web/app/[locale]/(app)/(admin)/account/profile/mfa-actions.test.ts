import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enrollTotpMock, verifyTotpMock, setRecoveryCodesMock, getMfaMasterKeyFromEnvMock } = vi.hoisted(() => ({
  enrollTotpMock: vi.fn(),
  verifyTotpMock: vi.fn(),
  setRecoveryCodesMock: vi.fn(),
  getMfaMasterKeyFromEnvMock: vi.fn(),
}));

const { queryMock, ctxRef } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  ctxRef: { userId: 'user-1', orgId: 'org-1' },
}));

vi.mock('../../../../../../../../packages/auth/src/totp.js', () => ({
  enrollTotp: enrollTotpMock,
  verifyTotp: verifyTotpMock,
  getMfaMasterKeyFromEnv: getMfaMasterKeyFromEnvMock,
}));

vi.mock('../../../../../../../../packages/auth/src/recovery.js', () => ({
  setRecoveryCodes: setRecoveryCodesMock,
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => unknown) =>
    action({ userId: ctxRef.userId, orgId: ctxRef.orgId, client: { query: queryMock } }),
}));

import {
  beginMfaReconfigureAction,
  confirmMfaReconfigureAction,
  readMfaBackendAvailability,
  regenerateBackupCodesAction,
} from './mfa-actions';

beforeEach(() => {
  enrollTotpMock.mockReset();
  verifyTotpMock.mockReset();
  setRecoveryCodesMock.mockReset();
  getMfaMasterKeyFromEnvMock.mockReset();
  queryMock.mockReset();
  getMfaMasterKeyFromEnvMock.mockReturnValue('aa'.repeat(32));
});

describe('readMfaBackendAvailability', () => {
  it('reports unavailable when MFA_MASTER_KEY is unset', () => {
    const prev = process.env.MFA_MASTER_KEY;
    delete process.env.MFA_MASTER_KEY;
    expect(readMfaBackendAvailability()).toEqual({ available: false });
    process.env.MFA_MASTER_KEY = prev;
  });

  it('reports available when MFA_MASTER_KEY is set', () => {
    const prev = process.env.MFA_MASTER_KEY;
    process.env.MFA_MASTER_KEY = 'deadbeef';
    expect(readMfaBackendAvailability()).toEqual({ available: true });
    process.env.MFA_MASTER_KEY = prev;
  });
});

describe('beginMfaReconfigureAction', () => {
  it('returns mfa_unavailable when the master key is missing', async () => {
    getMfaMasterKeyFromEnvMock.mockReturnValue('');
    const result = await beginMfaReconfigureAction();
    expect(result).toEqual({ ok: false, error: 'mfa_unavailable' });
    expect(enrollTotpMock).not.toHaveBeenCalled();
  });

  it('enrolls TOTP for the signed-in user and returns the provisioning payload', async () => {
    enrollTotpMock.mockResolvedValue({
      secret: 'BASE32SECRET',
      provisioningUri: 'otpauth://totp/Monopilot:user-1?secret=BASE32SECRET',
    });

    const result = await beginMfaReconfigureAction();

    expect(result).toEqual({
      ok: true,
      secret: 'BASE32SECRET',
      provisioningUri: 'otpauth://totp/Monopilot:user-1?secret=BASE32SECRET',
    });
    expect(enrollTotpMock).toHaveBeenCalledWith('user-1', {
      masterKey: 'aa'.repeat(32),
      tenantId: 'org-1',
    });
  });
});

describe('confirmMfaReconfigureAction', () => {
  it('rejects non-six-digit codes before hitting verifyTotp', async () => {
    const result = await confirmMfaReconfigureAction({ code: '12345' });
    expect(result).toEqual({ ok: false, error: 'invalid_code' });
    expect(verifyTotpMock).not.toHaveBeenCalled();
  });

  it('generates backup codes after a valid TOTP confirmation', async () => {
    verifyTotpMock.mockResolvedValue({ ok: true });
    setRecoveryCodesMock.mockResolvedValue(['code-1', 'code-2']);

    const result = await confirmMfaReconfigureAction({ code: '123456' });

    expect(result).toEqual({ ok: true, backupCodes: ['code-1', 'code-2'] });
    expect(verifyTotpMock).toHaveBeenCalledWith('user-1', '123456', {
      masterKey: 'aa'.repeat(32),
      tenantId: 'org-1',
    });
    expect(setRecoveryCodesMock).toHaveBeenCalledWith('user-1');
  });

  it('returns invalid_code when verifyTotp rejects the token', async () => {
    verifyTotpMock.mockResolvedValue({ ok: false, reason: 'invalid_code' });
    const result = await confirmMfaReconfigureAction({ code: '654321' });
    expect(result).toEqual({ ok: false, error: 'invalid_code' });
    expect(setRecoveryCodesMock).not.toHaveBeenCalled();
  });
});

describe('regenerateBackupCodesAction', () => {
  it('requires an enrolled MFA secret before regenerating codes', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const result = await regenerateBackupCodesAction({ code: '123456' });
    expect(result).toEqual({ ok: false, error: 'not_enrolled' });
    expect(verifyTotpMock).not.toHaveBeenCalled();
  });

  it('rotates backup codes after TOTP verification', async () => {
    queryMock.mockResolvedValue({ rows: [{}] });
    verifyTotpMock.mockResolvedValue({ ok: true });
    setRecoveryCodesMock.mockResolvedValue(['fresh-1', 'fresh-2']);

    const result = await regenerateBackupCodesAction({ code: '111222' });

    expect(result).toEqual({ ok: true, backupCodes: ['fresh-1', 'fresh-2'] });
    expect(setRecoveryCodesMock).toHaveBeenCalledWith('user-1');
  });
});
