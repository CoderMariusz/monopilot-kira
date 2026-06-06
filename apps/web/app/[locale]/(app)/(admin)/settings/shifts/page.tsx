import { getTranslations } from 'next-intl/server';

import { readShiftsSettingsData } from './_actions/shifts';
import ShiftsScreen, { type ShiftsScreenLabels } from './shifts-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ year?: string; month?: string }>;
};

async function buildLabels(locale: string): Promise<ShiftsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.shifts' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    newShift: t('new_shift'),
    patternsTitle: t('patterns_title'),
    patternsSubtitle: t('patterns_subtitle'),
    emptyPatterns: t('empty_patterns'),
    calendarTitle: t('calendar_title'),
    calendarSubtitle: t('calendar_subtitle'),
    legendWorking: t('legend_working'),
    legendWeekend: t('legend_weekend'),
    legendHoliday: t('legend_holiday'),
    columns: {
      name: t('column_name'),
      time: t('column_time'),
      days: t('column_days'),
      site: t('column_site'),
      line: t('column_line'),
      status: t('column_status'),
    },
    statusActive: t('status_active'),
    weekdayShort: [
      t('weekday_mon'),
      t('weekday_tue'),
      t('weekday_wed'),
      t('weekday_thu'),
      t('weekday_fri'),
      t('weekday_sat'),
      t('weekday_sun'),
    ],
  };
}

function clampMonth(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : fallback;
}

function clampYear(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 1900 && value <= 9999 ? value : fallback;
}

export default async function ShiftsSettingsPage({ params, searchParams }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const rawSearchParams = (await searchParams) ?? {};

  const today = new Date();
  const defaultYear = today.getUTCFullYear();
  const defaultMonth = today.getUTCMonth() + 1;
  const year = clampYear(Number(rawSearchParams.year), defaultYear);
  const month = clampMonth(Number(rawSearchParams.month), defaultMonth);

  const [labels, data] = await Promise.all([
    buildLabels(locale),
    readShiftsSettingsData(year, month),
  ]);

  return (
    <ShiftsScreen
      shiftPatterns={data.shift_patterns}
      calendarDays={data.calendar_days}
      year={year}
      month={month}
      labels={labels}
    />
  );
}
