import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ComponentProps } from 'react';

import { routing } from '../../i18n/routing';

type Props = {
  children: ComponentProps<typeof NextIntlClientProvider>['children'];
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  // Reject non-locale segments (e.g. a stray /favicon.ico routed through [locale])
  // so next-intl never receives an invalid language tag and throws INVALID_MESSAGE.
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
