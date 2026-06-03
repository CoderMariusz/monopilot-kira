import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Next 16 + Turbopack evaluates next.config.mjs before .env.local is loaded,
// so env vars defined there are not visible during config evaluation. Manually
// parse .env.local (per-app and workspace root) without overriding shell-set
// vars, so values like DEV_AUTH_BYPASS reach the Edge-runtime middleware bundle
// via the `env:` block below.
for (const envLocalPath of [
  path.join(__dirname, '.env.local'),
  path.join(__dirname, '..', '..', '.env.local'),
]) {
  if (!fs.existsSync(envLocalPath)) continue;
  const lines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// withSerwist wraps next config to compile sw.ts → /sw.js via webpack.
// Disabled in development to prevent stale precache from breaking Next.js HMR
// (T-041 risk red line).
const withSerwist = withSerwistInit({
  swSrc: path.join(__dirname, 'app', 'sw.ts'),
  swDest: path.join(__dirname, 'public', 'sw.js'),
  disable: process.env.NODE_ENV === 'development',
});

// withNextIntl wraps last (outermost) so it can see the fully resolved config.
// Plugin wrap order: withNextIntl( withSerwist( nextConfig ) )
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@monopilot/ui', '@monopilot/db', '@monopilot/observability'],
  env: {
    DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS ?? '',
  },
};

export default withNextIntl(withSerwist(nextConfig));
