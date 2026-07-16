import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInstrument,
  deactivateInstrument,
  getCalibrationPermissions,
  reactivateInstrument,
  recordCalibration,
  updateInstrument,
} from './calibration-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const REVIEWER_ID = '55555555-5555-4555-8555-555555555555';
const INSTRUMENT_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '44444444-4444-4444-8444-444444444444';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let grantedPermissions: Set<string>;
let instrumentExists = true;
let instrumentActive = true;
let client: QueryClient;

const revalidateMock = vi.fn();
const dualSignMock = vi.fn();

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: (...args: unknown[]) => revalidateMock(...args),
}));

vi.mock('@monopilot/e-sign', () => ({
  EPinFailedError: class EPinFailedError extends Error {
    constructor(message = 'Invalid password or PIN') {
      super(message);
      this.name = 'EPinFailedError';
    }
  },
  ESignPolicyError: class ESignPolicyError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },
  ESignSoDError: class ESignSoDError extends Error {
    constructor(message = 'Primary and secondary signers must be distinct') {
      super(message);
      this.name = 'ESignSoDError';
    }
  },
  dualSign: (...args: unknown[]) => dualSignMock(...args),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles') && normalized.includes('join public.roles')) {
        const permission = String(params?.[2] ?? '');
        const userId = String(params?.[0] ?? '');
        const ok =
          grantedPermissions.has(permission) &&
          (userId === USER_ID || userId === REVIEWER_ID);
        return { rows: ok ? [{ ok: true }] : [{ ok: false }], rowCount: 1 };
      }

      if (normalized.includes('from public.user_roles ur') && normalized.includes('join public.users u')) {
        const reviewerId = String(params?.[0] ?? '');
        const ok = reviewerId === REVIEWER_ID;
        return { rows: [{ ok }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.calibration_instruments')) {
        return { rows: [{ id: INSTRUMENT_ID }], rowCount: 1 };
      }

      if (normalized.includes('update public.calibration_instruments') && normalized.includes('instrument_code')) {
        return { rows: instrumentExists ? [{ id: INSTRUMENT_ID }] : [], rowCount: instrumentExists ? 1 : 0 };
      }

      if (
        normalized.includes('update public.calibration_instruments') &&
        normalized.includes('active = false') &&
        !normalized.includes('instrument_code')
      ) {
        return { rows: [{ id: INSTRUMENT_ID }], rowCount: 1 };
      }

      if (
        normalized.includes('update public.calibration_instruments') &&
        normalized.includes('active = true') &&
        !normalized.includes('instrument_code')
      ) {
        return { rows: instrumentExists ? [{ id: INSTRUMENT_ID }] : [], rowCount: instrumentExists ? 1 : 0 };
      }

      if (normalized.includes('from public.calibration_instruments') && normalized.includes('limit 1')) {
        return {
          rows: instrumentExists
            ? [
                {
                  id: INSTRUMENT_ID,
                  standard: 'NIST',
                  calibration_interval_days: 180,
                  instrument_code: 'SCALE-01',
                  active: instrumentActive,
                },
              ]
            : [],
          rowCount: instrumentExists ? 1 : 0,
        };
      }

      if (normalized.includes('insert into public.calibration_records')) {
        return { rows: [{ id: RECORD_ID }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

const SUBJECT_HASH = 'a'.repeat(64);

beforeEach(() => {
  grantedPermissions = new Set([
    'mnt.asset.read',
    'mnt.asset.edit',
    'mnt.asset.deactivate',
    'mnt.calib.record',
  ]);
  instrumentExists = true;
  instrumentActive = true;
  client = makeClient();
  revalidateMock.mockClear();
  dualSignMock.mockReset();
  dualSignMock.mockResolvedValue({
    primary: {
      signatureId: '88888888-8888-4888-8888-888888888888',
      signerUserId: USER_ID,
      intent: 'mnt.calib.record',
      subjectHash: SUBJECT_HASH,
      signedAt: '2026-06-11T12:00:00.000Z',
      auditEventId: 9,
      nonce: 'nonce-calib-primary',
    },
    secondary: {
      signatureId: '77777777-7777-4777-8777-777777777777',
      signerUserId: REVIEWER_ID,
      intent: 'mnt.calib.record',
      subjectHash: SUBJECT_HASH,
      signedAt: '2026-06-11T12:00:01.000Z',
      auditEventId: 10,
      nonce: 'nonce-calib-secondary',
    },
  });
});

const VALID_SIGNATURE = { password: '123456' };
const VALID_REVIEWER_SIGNATURE = { userId: REVIEWER_ID, password: '654321' };

describe('getCalibrationPermissions', () => {
  it('returns all false when no permissions are granted', async () => {
    grantedPermissions.clear();
    await expect(getCalibrationPermissions()).resolves.toEqual({
      canRead: false,
      canEditInstrument: false,
      canDeactivateInstrument: false,
      canRecord: false,
    });
  });

  it('reflects granted maintenance calibration permissions', async () => {
    await expect(getCalibrationPermissions()).resolves.toEqual({
      canRead: true,
      canEditInstrument: true,
      canDeactivateInstrument: true,
      canRecord: true,
    });
  });
});

describe('createInstrument', () => {
  it('forbids without mnt.asset.edit', async () => {
    grantedPermissions.delete('mnt.asset.edit');
    const result = await createInstrument({
      instrumentCode: 'SCALE-01',
      instrumentType: 'scale',
      standard: 'NIST',
      calibrationIntervalDays: 365,
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('inserts an instrument and revalidates the register route', async () => {
    const result = await createInstrument({
      instrumentCode: 'SCALE-01',
      instrumentType: 'scale',
      standard: 'NIST',
      calibrationIntervalDays: 365,
      rangeMin: '0.0000',
      rangeMax: '50.0000',
      unitOfMeasure: 'kg',
    });
    expect(result).toEqual({ ok: true, data: { instrumentId: INSTRUMENT_ID } });
    expect(revalidateMock).toHaveBeenCalledWith('/maintenance/calibration');
    const insertCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.calibration_instruments'),
    );
    expect(insertCall?.[1]).toEqual([
      'SCALE-01',
      'scale',
      'NIST',
      '0.0000',
      '50.0000',
      'kg',
      365,
      USER_ID,
    ]);
  });
});

describe('updateInstrument', () => {
  it('returns not_found when the instrument is absent', async () => {
    instrumentExists = false;
    const result = await updateInstrument({
      instrumentId: INSTRUMENT_ID,
      instrumentCode: 'SCALE-02',
      instrumentType: 'scale',
      standard: 'NIST',
      calibrationIntervalDays: 180,
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('deactivateInstrument', () => {
  it('requires mnt.asset.deactivate', async () => {
    grantedPermissions.delete('mnt.asset.deactivate');
    const result = await deactivateInstrument({ instrumentId: INSTRUMENT_ID });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('sets active=false', async () => {
    const result = await deactivateInstrument({ instrumentId: INSTRUMENT_ID });
    expect(result).toEqual({ ok: true, data: { instrumentId: INSTRUMENT_ID } });
    const sql = String(
      client.query.mock.calls.find(([s]) => normalize(String(s)).includes('active = false'))?.[0] ?? '',
    );
    expect(sql.toLowerCase()).toContain('update public.calibration_instruments');
  });
});

describe('reactivateInstrument', () => {
  it('requires mnt.asset.edit', async () => {
    grantedPermissions.delete('mnt.asset.edit');
    const result = await reactivateInstrument({ instrumentId: INSTRUMENT_ID });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('sets active=true and revalidates', async () => {
    const result = await reactivateInstrument({ instrumentId: INSTRUMENT_ID });
    expect(result).toEqual({ ok: true, data: { instrumentId: INSTRUMENT_ID } });
    const sql = String(
      client.query.mock.calls.find(([s]) => normalize(String(s)).includes('active = true'))?.[0] ?? '',
    );
    expect(sql.toLowerCase()).toContain('update public.calibration_instruments');
    expect(revalidateMock).toHaveBeenCalledWith('/maintenance/calibration');
  });

  it('returns not_found when the instrument is absent', async () => {
    instrumentExists = false;
    const result = await reactivateInstrument({ instrumentId: INSTRUMENT_ID });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('recordCalibration', () => {
  it('requires mnt.calib.record', async () => {
    grantedPermissions.delete('mnt.calib.record');
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('inserts a record, computes next due from interval, and emits completed outbox', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01T10:00:00.000Z',
      result: 'PASS',
      testPoints: [{ reference: '0 kg', measured: '0.01', tolerance_pct: 0.1 }],
      certificateRef: 'CERT-2026-001',
      notes: 'Within tolerance',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordId).toBe(RECORD_ID);
      expect(result.data.nextDueDate).toBe('2026-11-28');
      expect(result.data.rowPatch).toEqual({
        instrumentId: INSTRUMENT_ID,
        calibratedAt: '2026-06-01T10:00:00.000Z',
        result: 'PASS',
        certificateFileUrl: 'CERT-2026-001',
        nextDueDate: '2026-11-28',
        active: true,
      });
    }

    expect(dualSignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primarySignerUserId: USER_ID,
        primaryPin: '123456',
        secondarySignerUserId: REVIEWER_ID,
        secondaryPin: '654321',
        intent: 'mnt.calib.record',
        subject: expect.objectContaining({
          instrumentId: INSTRUMENT_ID,
          result: 'PASS',
          standardApplied: 'NIST',
          certificateRef: 'CERT-2026-001',
          notes: 'Within tolerance',
          testPoints: [{ reference: '0 kg', measured: '0.01', tolerance_pct: 0.1 }],
        }),
      }),
      expect.any(Object),
    );

    const insertCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.calibration_records'),
    );
    expect(insertCall?.[1]?.[2]).toBe(USER_ID);
    expect(insertCall?.[1]?.[6]).toBe('CERT-2026-001');
    expect(insertCall?.[1]?.[7]).toBeNull();
    expect(insertCall?.[1]?.[10]).toBe(REVIEWER_ID);
    expect(insertCall?.[1]?.[11]).toBe('88888888-8888-4888-8888-888888888888');
    expect(insertCall?.[1]?.[12]).toBe('77777777-7777-4777-8777-777777777777');

    const outboxCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.outbox_events'),
    );
    expect(outboxCall?.[1]?.[0]).toBe('maintenance.calibration.completed');
    expect(revalidateMock).toHaveBeenCalledWith('/maintenance/calibration');
  });

  it('rejects the same user as calibrator and reviewer (SoD)', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: { userId: USER_ID, password: '654321' },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'sod_violation',
      message: 'Primary and secondary signers must be distinct',
    });
    expect(dualSignMock).not.toHaveBeenCalled();
    expect(
      client.query.mock.calls.some(([sql]) =>
        normalize(String(sql)).includes('insert into public.calibration_records'),
      ),
    ).toBe(false);
  });

  it('rejects when dualSign raises ESignSoDError and rolls back via throw', async () => {
    const { ESignSoDError } = await import('@monopilot/e-sign');
    dualSignMock.mockRejectedValueOnce(new ESignSoDError());

    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'sod_violation',
      message: 'Primary and secondary signers must be distinct',
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        normalize(String(sql)).includes('insert into public.calibration_records'),
      ),
    ).toBe(false);
  });

  it('rejects mismatched dualSign receipt hashes', async () => {
    dualSignMock.mockResolvedValueOnce({
      primary: {
        signatureId: '88888888-8888-4888-8888-888888888888',
        signerUserId: USER_ID,
        intent: 'mnt.calib.record',
        subjectHash: SUBJECT_HASH,
        signedAt: '2026-06-11T12:00:00.000Z',
        auditEventId: 9,
        nonce: 'nonce-calib-primary',
      },
      secondary: {
        signatureId: '77777777-7777-4777-8777-777777777777',
        signerUserId: REVIEWER_ID,
        intent: 'mnt.calib.record',
        subjectHash: 'b'.repeat(64),
        signedAt: '2026-06-11T12:00:01.000Z',
        auditEventId: 10,
        nonce: 'nonce-calib-secondary',
      },
    });

    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'esign_failed',
      message: 'Primary and secondary signature hashes must match the same calibration subject',
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        normalize(String(sql)).includes('insert into public.calibration_records'),
      ),
    ).toBe(false);
  });

  it('rejects a reviewer outside the current organization', async () => {
    const OUTSIDER_ID = '66666666-6666-4666-8666-666666666666';
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: { userId: OUTSIDER_ID, password: '654321' },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'Reviewer must be an active user in the current organization',
    });
    expect(dualSignMock).not.toHaveBeenCalled();
  });

  it('on FAIL deactivates the instrument and emits failed outbox', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'FAIL',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.nextDueDate).toBe('2026-06-01');
    }

    const deactivateCalls = client.query.mock.calls.filter(([sql]) => {
      const n = normalize(String(sql));
      return n.includes('update public.calibration_instruments') && n.includes('active = false');
    });
    expect(deactivateCalls.length).toBeGreaterThanOrEqual(1);

    const outboxCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.outbox_events'),
    );
    expect(outboxCall?.[1]?.[0]).toBe('maintenance.calibration.failed');
  });

  it('on OUT_OF_SPEC deactivates the instrument, does not advance next due, and emits failed outbox', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'OUT_OF_SPEC',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.nextDueDate).toBe('2026-06-01');
      expect(result.data.nextDueDate).not.toBe('2026-11-28');
    }

    const deactivateCalls = client.query.mock.calls.filter(([sql]) => {
      const n = normalize(String(sql));
      return n.includes('update public.calibration_instruments') && n.includes('active = false');
    });
    expect(deactivateCalls.length).toBeGreaterThanOrEqual(1);

    const outboxCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.outbox_events'),
    );
    expect(outboxCall?.[1]?.[0]).toBe('maintenance.calibration.failed');
  });

  it('rejects a future calibratedAt date', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2099-01-15',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'calibratedAt cannot be in the future',
    });
  });

  it('returns esign_failed and records nothing when PIN verification fails', async () => {
    const { EPinFailedError } = await import('@monopilot/e-sign');
    dualSignMock.mockRejectedValueOnce(new EPinFailedError());

    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: { password: 'wrong' },
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'esign_failed',
      message: 'Invalid password or PIN',
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        normalize(String(sql)).includes('insert into public.calibration_records'),
      ),
    ).toBe(false);
  });

  it('rejects FAIL on an inactive instrument', async () => {
    instrumentActive = false;
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'FAIL',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'instrument must be active to record a failing calibration',
    });
  });

  it('reactivates an inactive instrument on PASS', async () => {
    instrumentActive = false;
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'PASS',
      signature: VALID_SIGNATURE,
      reviewerSignature: VALID_REVIEWER_SIGNATURE,
    });
    expect(result.ok).toBe(true);

    const reactivateCalls = client.query.mock.calls.filter(([sql]) => {
      const n = normalize(String(sql));
      return n.includes('update public.calibration_instruments') && n.includes('active = true');
    });
    expect(reactivateCalls.length).toBeGreaterThanOrEqual(1);

    const outboxCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.outbox_events'),
    );
    expect(outboxCall?.[1]?.[0]).toBe('maintenance.calibration.completed');
  });
});
