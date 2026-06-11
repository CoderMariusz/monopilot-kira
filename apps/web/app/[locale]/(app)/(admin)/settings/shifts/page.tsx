import { getTranslations } from 'next-intl/server';

import { createShiftPattern, readShiftsSettingsData, type CreateShiftPatternInput } from './_actions/shifts';
import ShiftsScreen, { type ShiftsScreenLabels } from './shifts-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ year?: string; month?: string }>;
};

async function buildLabels(locale: string): Promise<ShiftsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.shifts' });
  const en = locale === 'en' ? t : await getTranslations({ locale: 'en', namespace: 'settings.shifts' });
  const label = (key: string, fallback: string): string => {
    try {
      if (t.has(key)) return t(key);
      if (en.has(key)) return en(key);
      return fallback;
    } catch {
      return fallback;
    }
  };

  return {
    title: label('title', 'Shifts & calendar'),
    subtitle: label('subtitle', 'Work patterns, non-production days, and shift assignments.'),
    newShift: label('new_shift', '+ New shift'),
    patternsTitle: label('patterns_title', 'Shift patterns'),
    patternsSubtitle: label('patterns_subtitle', 'Recurring work patterns used to schedule production.'),
    emptyPatterns: label('empty_patterns', 'No shift patterns are configured yet.'),
    calendarTitle: label('calendar_title', 'Calendar'),
    calendarSubtitle: label('calendar_subtitle', 'Days on which production is paused.'),
    legendWorking: label('legend_working', 'Working day'),
    legendWeekend: label('legend_weekend', 'Weekend'),
    legendHoliday: label('legend_holiday', 'Public holiday'),
    columns: {
      name: label('column_name', 'Name'),
      time: label('column_time', 'Time'),
      days: label('column_days', 'Days'),
      site: label('column_site', 'Site'),
      line: label('column_line', 'Line'),
      status: label('column_status', 'Status'),
    },
    statusActive: label('status_active', 'Active'),
    weekdayShort: [
      label('weekday_mon', 'Mon'),
      label('weekday_tue', 'Tue'),
      label('weekday_wed', 'Wed'),
      label('weekday_thu', 'Thu'),
      label('weekday_fri', 'Fri'),
      label('weekday_sat', 'Sat'),
      label('weekday_sun', 'Sun'),
    ],
    dialogTitle: label('dialog_title', 'New shift'),
    fieldName: label('field_name', 'Name'),
    fieldStart: label('field_start', 'Start'),
    fieldEnd: label('field_end', 'End'),
    fieldDays: label('field_days', 'Days'),
    fieldSite: label('field_site', 'Site'),
    fieldLine: label('field_line', 'Line'),
    allSites: label('all_sites', 'All sites'),
    noLine: label('no_line', 'No line'),
    cancel: label('cancel', 'Cancel'),
    save: label('save', 'Save'),
    saving: label('saving', 'Saving...'),
    createFailed: label('create_failed', 'Shift could not be created.'),
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

  async function createShiftAction(input: CreateShiftPatternInput) {
    'use server';
    return createShiftPattern(input);
  }

  return (
    <ShiftsScreen
      shiftPatterns={data.shift_patterns}
      calendarDays={data.calendar_days}
      year={year}
      month={month}
      canEdit={data.can_edit}
      sites={data.sites}
      lines={data.lines}
      labels={labels}
      createShiftAction={createShiftAction}
    />
  );
}
