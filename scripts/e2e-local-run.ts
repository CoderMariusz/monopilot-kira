/**
 * Runs Playwright against the local shell-parity harness. Always invoked through
 * scripts/e2e-local.sh — that script owns the "never point at production" guard.
 *
 * startLocalShellParityHarness() (apps/web/e2e/_helpers/shell-parity.ts) is the
 * single local-auth mechanism: it boots a fake Supabase Auth server (/auth/v1/user
 * + /auth/v1/token) and `pnpm --filter web dev` with DEV_AUTH_BYPASS=true, keeping
 * our DATABASE_URL_* exports. We start it once for the whole (sequential) run and
 * hand the specs its URLs; signIn() then installs the harness session cookie.
 */
import { spawn } from 'node:child_process';

import { startLocalShellParityHarness } from '../apps/web/e2e/_helpers/shell-parity';

async function main(): Promise<void> {
  const specs = process.argv.slice(2);
  if (process.env.E2E_LOCAL !== '1') {
    throw new Error('E2E_LOCAL is not 1 — run scripts/e2e-local.sh, not this file directly.');
  }
  if (specs.length === 0) throw new Error('No specs given.');

  const harness = await startLocalShellParityHarness();
  console.log(`[e2e-local] ${harness.server_identity}`);

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await harness.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void close().then(() => process.exit(130));
    });
  }

  // --trace on: retries are 0 locally, so the config's 'on-first-retry' never fires.
  const child = spawn(
    'pnpm',
    ['exec', 'playwright', 'test', ...specs, '--workers=1', '--trace', 'on', '--reporter=list'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: harness.baseURL,
        E2E_LOCAL_SUPABASE_URL: harness.supabaseUrl,
      },
    },
  );

  const code = await new Promise<number>((resolve) => {
    child.on('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
    child.on('error', (error) => {
      console.error(error);
      resolve(1);
    });
  });

  await close();
  process.exit(code);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
