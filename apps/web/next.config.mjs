import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default withNextIntl(withSerwist(nextConfig));
