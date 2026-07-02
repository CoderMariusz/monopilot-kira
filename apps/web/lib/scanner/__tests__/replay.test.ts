import { describe, expect, it, vi } from 'vitest';

import {
  CLIENT_TELEMETRY_OPERATION_PREFIX,
  findServerReplay,
  insertServerReplay,
  reconstructServerReplayError,
  toClientTelemetryOperation,
} from '../replay';

const fakeClient = {
  query: vi.fn(),
};

describe('scanner replay helpers', () => {
  it('prefixes client telemetry operations', () => {
    expect(toClientTelemetryOperation('scanner.scan')).toBe('client.scanner.scan');
    expect(toClientTelemetryOperation('client.scanner.scan')).toBe('client.scanner.scan');
  });

  it('findServerReplay filters on operation and excludes client telemetry namespace', async () => {
    fakeClient.query.mockResolvedValueOnce({ rows: [] });
    await findServerReplay(fakeClient, 'org-1', 'op-1', 'production.scanner.wos.output');
    const [sql, params] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('and operation = $3');
    expect(sql).toContain("operation not like 'client.%'");
    expect(params).toEqual(['org-1', 'op-1', 'production.scanner.wos.output']);
  });

  it('does not treat client telemetry rows as server replay', async () => {
    fakeClient.query.mockResolvedValueOnce({
      rows: [{ result_code: 'ok', ext: { poisoned: true } }],
    });
    const row = await findServerReplay(
      fakeClient,
      'org-1',
      'op-poison',
      'production.scanner.wos.consume',
    );
    expect(row?.ext).toEqual({ poisoned: true });
    expect(CLIENT_TELEMETRY_OPERATION_PREFIX).toBe('client.');
  });

  it('scopes replay probes per operation so the same clientOpId can be independent', async () => {
    fakeClient.query.mockReset();
    fakeClient.query.mockResolvedValue({ rows: [] });
    await findServerReplay(fakeClient, 'org-1', 'shared-op', 'production.scanner.wos.output');
    const [, outputParams] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(outputParams[2]).toBe('production.scanner.wos.output');

    fakeClient.query.mockReset();
    fakeClient.query.mockResolvedValue({ rows: [] });
    await findServerReplay(fakeClient, 'org-1', 'shared-op', 'production.scanner.wos.waste');
    const [, wasteParams] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(wasteParams[2]).toBe('production.scanner.wos.waste');
    expect(outputParams[1]).toBe(wasteParams[1]);
  });

  it('reconstructServerReplayError rebuilds the stored failure envelope', () => {
    const rebuilt = reconstructServerReplayError({
      result_code: 'not_found',
      ext: { woId: 'wo-1', clientOpId: 'op-1', status: 404, details: null },
    });
    expect(rebuilt).toEqual({ error: 'not_found', status: 404, extra: { details: null } });
  });

  it('insertServerReplay writes operation for per-operation uniqueness', async () => {
    fakeClient.query.mockReset();
    fakeClient.query.mockResolvedValue({ rows: [] });
    await insertServerReplay(fakeClient, {
      id: 'sess',
      org_id: 'org-1',
      user_id: 'user-1',
      device_id: 'dev-1',
    } as never, {
      operation: 'production.scanner.wos.start',
      clientOpId: 'op-start',
      resultCode: 'forbidden',
      ext: { status: 403 },
    });
    const [sql, params] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.scanner_audit_log');
    expect(params[4]).toBe('production.scanner.wos.start');
    expect(params[7]).toBe('forbidden');
    expect(params[8]).toBe('op-start');
  });
});
