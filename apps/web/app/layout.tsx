import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import RegisterSW from './_components/RegisterSW';

// A3 — self-hosted font loading via next/font (no FOUT, no CDN round-trip).
// Inter is the design-system body face; JetBrains Mono is codes/IDs/timestamps.
// The faces are exposed as CSS variables that globals.css wires into
// --font-sans / --font-mono, so existing `font-family: var(--font-sans)` keeps
// working. The Google-Fonts CDN @import in globals.css is removed since these
// cover it fully.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap'
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Monopilot Kira'
};

// Perf: co-locate the (dynamic) server functions with the Supabase database, which
// lives in eu-central-2. The Vercel default region was iad1 (US-east), so EVERY DB
// round-trip crossed the Atlantic (~100ms each); with ~20+ round-trips per page that
// was the dominant ~4s page-render cost. fra1 (Frankfurt) is next to eu-central-2,
// cutting each round-trip to ~10-15ms. (Also set as the Vercel project Function Region.)
export const preferredRegion = 'fra1';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <RegisterSW />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
