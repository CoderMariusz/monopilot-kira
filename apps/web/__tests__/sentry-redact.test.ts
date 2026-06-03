import { afterEach, describe, expect, it, vi } from 'vitest';

const sentryInit = vi.fn();
const sentryCaptureException = vi.fn();
const sentryWithConfig = vi.fn((config: unknown, sentryOptions: unknown) => ({
  config,
  sentryOptions,
}));

vi.mock('@sentry/nextjs', () => ({
  init: sentryInit,
  captureException: sentryCaptureException,
  withSentryConfig: sentryWithConfig,
}));

function collectSecretPaths(value: unknown, path: string[] = []): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const paths: string[] = [];
  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (/(password|token|cookie|authorization)/i.test(key)) {
      paths.push(nextPath.join('.'));
    }
    paths.push(...collectSecretPaths(nestedValue, nextPath));
  }

  return paths;
}

async function importFresh<T>(path: string): Promise<T> {
  vi.resetModules();
  return import(path) as Promise<T>;
}

describe('Sentry web configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    sentryInit.mockClear();
    sentryCaptureException.mockClear();
    sentryWithConfig.mockClear();
    vi.resetModules();
  });

  it('captures an unhandled server-action error once with deeply redacted event data', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SENTRY_DSN: 'https://public@example.invalid/1',
      SENTRY_RELEASE: 'sha-redact-test',
    };

    await importFresh('../sentry.server.config');
    expect(sentryInit).toHaveBeenCalledTimes(1);

    const initOptions = sentryInit.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    const error = new Error('server action failed');
    const event = initOptions.beforeSend({
      user: { id: 'user-1', email: 'person@example.com' },
      request: {
        cookies: { session: 'cookie-value' },
        headers: {
          Authorization: 'Bearer token-value',
          'x-safe': 'ok',
        },
      },
      extra: {
        password: 'secret',
        nested: {
          apiToken: 'nested-token',
          safeValue: 'kept',
        },
      },
      contexts: {
        runtime: {
          token: 'runtime-token',
          name: 'next',
        },
      },
    });

    async function mockedServerAction() {
      try {
        throw error;
      } catch (err) {
        sentryCaptureException(err, event);
        throw err;
      }
    }

    await expect(mockedServerAction()).rejects.toThrow('server action failed');
    expect(sentryCaptureException).toHaveBeenCalledTimes(1);
    expect(sentryCaptureException).toHaveBeenCalledWith(error, event);
    expect(collectSecretPaths(event)).toEqual([]);
    expect(event).toMatchObject({
      extra: {
        nested: {
          safeValue: 'kept',
        },
      },
    });
  });

  it('passes SENTRY_RELEASE through to the SDK exactly', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SENTRY_DSN: 'https://public@example.invalid/1',
      SENTRY_RELEASE: 'abcdef1234567890',
    };

    await importFresh('../sentry.client.config');

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryInit.mock.calls[0]?.[0]).toMatchObject({
      release: 'abcdef1234567890',
    });
  });

  it('configures Sentry source-map upload dryRun when SENTRY_AUTH_TOKEN is absent', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
    };
    delete process.env.SENTRY_AUTH_TOKEN;

    const configModule = await importFresh('../next.config.mjs');

    expect(configModule.default).toMatchObject({
      sentryOptions: {
        silent: true,
        dryRun: true,
      },
    });
    expect(sentryWithConfig).toHaveBeenCalledTimes(1);
  });
});
