import { pathToFileURL } from 'node:url';

const REQUIRED_SETTINGS = [
  { key: 'JWT_EXP', aliases: ['jwt_exp'], expected: 900 },
  { key: 'MAILER_OTP_EXP', aliases: ['mailer_otp_exp'], expected: 604800 },
  { key: 'REFRESH_TOKEN_ROTATION_ENABLED', aliases: ['refresh_token_rotation_enabled'], expected: true },
  { key: 'SECURITY_REFRESH_TOKEN_REUSE_INTERVAL', aliases: ['security_refresh_token_reuse_interval'], expected: 10 },
] as const;

type RequiredSetting = (typeof REQUIRED_SETTINGS)[number];
type ConfigValue = string | number | boolean | null | undefined;

export type VerifySupabaseConfigOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  stdout?: Pick<typeof process.stdout, 'write'>;
  stderr?: Pick<typeof process.stderr, 'write'>;
  timeoutMs?: number;
};

export type VerifySupabaseConfigResult = {
  exitCode: 0 | 1;
  verified: Array<{ key: string; expected: ConfigValue; actual: ConfigValue }>;
  mismatches: Array<{ key: string; expected: ConfigValue; actual: ConfigValue }>;
};

export async function verifySupabaseConfig(options: VerifySupabaseConfigOptions = {}): Promise<VerifySupabaseConfigResult> {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  const supabaseUrl = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missingEnv = [
    supabaseUrl ? null : 'SUPABASE_URL',
    serviceRoleKey ? null : 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((value): value is string => value !== null);

  if (missingEnv.length > 0) {
    stderr.write(`Supabase config verification failed: missing required env ${missingEnv.join(', ')}\n`);
    return { exitCode: 1, verified: [], mismatches: [] };
  }

  if (!fetchImpl) {
    stderr.write('Supabase config verification failed: global fetch is unavailable\n');
    return { exitCode: 1, verified: [], mismatches: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/config`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    stderr.write(`Supabase config verification failed: ${formatError(error, timeoutMs)}\n`);
    return { exitCode: 1, verified: [], mismatches: [] };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    stderr.write(`Supabase config verification failed: Admin API returned HTTP ${response.status} ${response.statusText}\n`);
    return { exitCode: 1, verified: [], mismatches: [] };
  }

  let config: Record<string, unknown>;
  try {
    const json = (await response.json()) as unknown;
    if (!isRecord(json)) {
      stderr.write('Supabase config verification failed: Admin API response JSON is not an object\n');
      return { exitCode: 1, verified: [], mismatches: [] };
    }
    config = json;
  } catch (error) {
    stderr.write(`Supabase config verification failed: could not parse Admin API response JSON: ${formatError(error, timeoutMs)}\n`);
    return { exitCode: 1, verified: [], mismatches: [] };
  }

  const verified: VerifySupabaseConfigResult['verified'] = [];
  const mismatches: VerifySupabaseConfigResult['mismatches'] = [];

  for (const setting of REQUIRED_SETTINGS) {
    const actual = readConfigValue(config, setting);
    if (actual === setting.expected) {
      verified.push({ key: setting.key, expected: setting.expected, actual });
    } else {
      mismatches.push({ key: setting.key, expected: setting.expected, actual });
    }
  }

  for (const item of verified) {
    stdout.write(`ok ${item.key}=${formatValue(item.actual)}\n`);
  }

  if (mismatches.length > 0) {
    stderr.write('Supabase Auth config drift detected:\n');
    for (const item of mismatches) {
      stderr.write(`- ${item.key}: expected ${formatValue(item.expected)}, actual ${formatValue(item.actual)}\n`);
    }
    return { exitCode: 1, verified, mismatches };
  }

  return { exitCode: 0, verified, mismatches };
}

function readConfigValue(config: Record<string, unknown>, setting: RequiredSetting): ConfigValue {
  const raw = [setting.key, ...setting.aliases].map((key) => config[key]).find((value) => value !== undefined);

  if (typeof setting.expected === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      if (raw.toLowerCase() === 'true') return true;
      if (raw.toLowerCase() === 'false') return false;
    }
    return raw as ConfigValue;
  }

  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  return raw as ConfigValue;
}

function formatValue(value: ConfigValue): string {
  return value === undefined ? '<missing>' : JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `Admin API request timed out after ${timeoutMs}ms`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void verifySupabaseConfig()
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(`Supabase config verification failed: ${formatError(error, 5000)}\n`);
      process.exitCode = 1;
    });
}
