import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';
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

// PWA / service worker (Wave F P1-18 MINIMAL):
// `@serwist/next` is a webpack plugin; production builds use Turbopack and never
// emit its compiled worker. The live SW is the hand-written static asset at
// `public/sw.js` (read-only cache; no offline write-queue). Keep Serwist disabled
// so a webpack fallback build cannot overwrite that committed file.
const withSerwist = withSerwistInit({
  swSrc: path.join(__dirname, 'app', 'sw.ts'),
  swDest: path.join(__dirname, 'public', 'sw.js'),
  disable: true,
});

// withNextIntl wraps after app plugins so it can see the fully resolved config.
// Plugin wrap order: withSentryConfig( withNextIntl( withSerwist( nextConfig ) ) )
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@monopilot/ui', '@monopilot/db', '@monopilot/observability'],
  env: {
    DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS ?? '',
  },
  // NPD-DYN FA→FG: the Finished-Goods route moved from /fa to /fg (A5 Phase 1B).
  // Keep old /fa URLs working (bookmarks, external links) via temporary (non-
  // permanent) redirects. The FA product-CODE prefix, npd.fa.* perms, and fa.*
  // events are intentionally NOT renamed by this slice — these redirects only
  // map the URL path. Locale-prefixed forms first, then bare /fa as a fallback.
  async redirects() {
    return [
      { source: '/:locale/fa', destination: '/:locale/fg', permanent: false },
      { source: '/:locale/fa/:path*', destination: '/:locale/fg/:path*', permanent: false },
      { source: '/fa', destination: '/fg', permanent: false },
      { source: '/fa/:path*', destination: '/fg/:path*', permanent: false },
    ];
  },
  // Static `public/sw.js` is served with .js MIME by Next; force revalidate so
  // scanners pick up SW strategy updates, and allow full-origin scope.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(withSerwist(nextConfig)), {
  silent: true,
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
});
