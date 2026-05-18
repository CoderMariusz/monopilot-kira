import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDate } from '../../../lib/i18n/format';

describe('[locale] layout i18n wiring', () => {
  it("passes the route locale to NextIntlClientProvider and supports Polish date formatting", () => {
    const layoutSource = readFileSync(path.join(__dirname, '..', 'layout.tsx'), 'utf8');

    expect(layoutSource).toContain('const { locale } = await params');
    expect(layoutSource).toContain('<NextIntlClientProvider locale={locale} messages={messages}>');
    expect(formatDate(new Date('2025-05-07T12:00:00Z'), 'pl')).toBe('7 maja 2025');
  });
});
