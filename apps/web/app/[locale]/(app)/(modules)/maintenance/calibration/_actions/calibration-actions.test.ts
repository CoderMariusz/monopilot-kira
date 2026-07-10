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

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: (...args: unknown[]) => revalidateMock(...args),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
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
});

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
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('inserts a record, computes next due from interval, and emits completed outbox', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01T10:00:00.000Z',
      result: 'PASS',
      certificateRef: 'CERT-2026-001',
      notes: 'Within tolerance',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordId).toBe(RECORD_ID);
      expect(result.data.nextDueDate).toBe('2026-11-28');
    }

    const outboxCall = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.outbox_events'),
    );
    expect(outboxCall?.[1]?.[0]).toBe('maintenance.calibration.completed');
    expect(revalidateMock).toHaveBeenCalledWith('/maintenance/calibration');
  });

  it('on FAIL deactivates the instrument and emits failed outbox', async () => {
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'FAIL',
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
    });
    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'calibratedAt cannot be in the future',
    });
  });

  it('rejects FAIL on an inactive instrument', async () => {
    instrumentActive = false;
    const result = await recordCalibration({
      instrumentId: INSTRUMENT_ID,
      calibratedAt: '2026-06-01',
      result: 'FAIL',
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
