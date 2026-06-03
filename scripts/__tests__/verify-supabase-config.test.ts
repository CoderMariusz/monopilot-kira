import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifySupabaseConfig } from '../verify-supabase-config';

const GOOD_CONFIG = {
  JWT_EXP: 900,
  MAILER_OTP_EXP: 604800,
  REFRESH_TOKEN_ROTATION_ENABLED: true,
  SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: 10,
};

const ENV = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('verify-supabase-config', () => {
  it('passes and lists every verified setting when deployed GoTrue config matches', async () => {
    const fetchMock = mockFetch(GOOD_CONFIG);
    const output = makeOutput();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifySupabaseConfig({ env: ENV, stdout: output.stdout, stderr: output.stderr });

    expect(result.exitCode).toBe(0);
    expect(result.mismatches).toEqual([]);
    expect(output.stderrText()).toBe('');
    expect(output.stdoutText()).toContain('ok JWT_EXP=900');
    expect(output.stdoutText()).toContain('ok MAILER_OTP_EXP=604800');
    expect(output.stdoutText()).toContain('ok REFRESH_TOKEN_ROTATION_ENABLED=true');
    expect(output.stdoutText()).toContain('ok SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10');
    expect(fetchMock).toHaveBeenCalledWith('https://project-ref.supabase.co/auth/v1/admin/config', {
      method: 'GET',
      headers: {
        apikey: 'service-role-key',
        Authorization: 'Bearer service-role-key',
      },
      signal: expect.any(AbortSignal),
    });
  });

  it('accepts lowercase GoTrue JSON keys returned by the Admin API', async () => {
    const fetchMock = mockFetch({
      jwt_exp: 900,
      mailer_otp_exp: 604800,
      refresh_token_rotation_enabled: true,
      security_refresh_token_reuse_interval: 10,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifySupabaseConfig({ env: ENV, stdout: makeOutput().stdout, stderr: makeOutput().stderr });

    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['JWT_EXP', 3600],
    ['MAILER_OTP_EXP', 420],
    ['REFRESH_TOKEN_ROTATION_ENABLED', false],
    ['SECURITY_REFRESH_TOKEN_REUSE_INTERVAL', 0],
  ] as const)('fails with a clear diff when %s drifts', async (key, actual) => {
    const fetchMock = mockFetch({ ...GOOD_CONFIG, [key]: actual });
    const output = makeOutput();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifySupabaseConfig({ env: ENV, stdout: output.stdout, stderr: output.stderr });

    expect(result.exitCode).toBe(1);
    expect(result.mismatches).toEqual([
      {
        key,
        expected: GOOD_CONFIG[key],
        actual,
      },
    ]);
    expect(output.stderrText()).toContain('Supabase Auth config drift detected:');
    expect(output.stderrText()).toContain(`- ${key}: expected ${JSON.stringify(GOOD_CONFIG[key])}, actual ${JSON.stringify(actual)}`);
  });

  it('fails closed without calling fetch when required env is unset', async () => {
    const fetchMock = vi.fn();
    const output = makeOutput();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifySupabaseConfig({ env: {}, stdout: output.stdout, stderr: output.stderr });

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.stderrText()).toContain('missing required env SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  });

  it('fails closed when the Admin API returns an error response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403, statusText: 'Forbidden' }));
    const output = makeOutput();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifySupabaseConfig({ env: ENV, stdout: output.stdout, stderr: output.stderr });

    expect(result.exitCode).toBe(1);
    expect(output.stderrText()).toContain('Admin API returned HTTP 403 Forbidden');
  });
});

function mockFetch(config: Record<string, unknown>) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(config), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function makeOutput() {
  let stdout = '';
  let stderr = '';

  return {
    stdout: {
      write(chunk: string) {
        stdout += chunk;
        return true;
      },
    },
    stderr: {
      write(chunk: string) {
        stderr += chunk;
        return true;
      },
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  };
}
