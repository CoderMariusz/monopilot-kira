'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type CalibrationDbRow = {
  instrument_id: string;
  site_id: string | null;
  equipment_id: string | null;
  instrument_code: string;
  instrument_type: string;
  standard: string;
  range_min: string | null;
  range_max: string | null;
  unit_of_measure: string | null;
  calibration_interval_days: number;
  active: boolean;
  record_id: string | null;
  calibrated_at: Date | string | null;
  calibrated_by: string | null;
  standard_applied: string | null;
  result: string | null;
  certificate_file_url: string | null;
  next_due_date: Date | string | null;
  reviewer_signed_by: string | null;
  retention_until: Date | string | null;
};

type CalibrationDueRow = {
  instrumentId: string;
  siteId: string | null;
  equipmentId: string | null;
  instrumentCode: string;
  instrumentType: string;
  standard: string;
  rangeMin: string | null;
  rangeMax: string | null;
  unitOfMeasure: string | null;
  calibrationIntervalDays: number;
  active: boolean;
  recordId: string | null;
  calibratedAt: string | null;
  calibratedBy: string | null;
  standardApplied: string | null;
  result: string | null;
  certificateFileUrl: string | null;
  nextDueDate: string | null;
  reviewerSignedBy: string | null;
  retentionUntil: string | null;
};

function toDateString(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapCalibrationRow(row: CalibrationDbRow): CalibrationDueRow {
  return {
    instrumentId: row.instrument_id,
    siteId: row.site_id,
    equipmentId: row.equipment_id,
    instrumentCode: row.instrument_code,
    instrumentType: row.instrument_type,
    standard: row.standard,
    rangeMin: row.range_min,
    rangeMax: row.range_max,
    unitOfMeasure: row.unit_of_measure,
    calibrationIntervalDays: row.calibration_interval_days,
    active: row.active,
    recordId: row.record_id,
    calibratedAt: toIsoString(row.calibrated_at),
    calibratedBy: row.calibrated_by,
    standardApplied: row.standard_applied,
    result: row.result,
    certificateFileUrl: row.certificate_file_url,
    nextDueDate: toDateString(row.next_due_date),
    reviewerSignedBy: row.reviewer_signed_by,
    retentionUntil: toDateString(row.retention_until),
  };
}

export async function listCalibration(): Promise<CalibrationDueRow[]> {
  try {
    return await withOrgContext(async ({ client }): Promise<CalibrationDueRow[]> => {
      const qc = client as QueryClient;
      const { rows } = await qc.query<CalibrationDbRow>(
        `select
            ci.id as instrument_id,
            ci.site_id,
            ci.equipment_id,
            ci.instrument_code,
            ci.instrument_type,
            ci.standard,
            ci.range_min,
            ci.range_max,
            ci.unit_of_measure,
            ci.calibration_interval_days,
            ci.active,
            cr.id as record_id,
            cr.calibrated_at,
            cr.calibrated_by,
            cr.standard_applied,
            cr.result,
            cr.certificate_file_url,
            cr.next_due_date,
            cr.reviewer_signed_by,
            cr.retention_until
           from public.calibration_instruments ci
           left join (
              select distinct on (cr_latest.instrument_id)
                     cr_latest.*
                from public.calibration_records cr_latest
               where cr_latest.org_id = app.current_org_id()
               order by cr_latest.instrument_id, cr_latest.calibrated_at desc, cr_latest.id desc
            ) cr
             on cr.instrument_id = ci.id
          where ci.org_id = app.current_org_id()
          order by cr.next_due_date asc nulls last, ci.instrument_code asc`,
      );

      return rows.map(mapCalibrationRow);
    });
  } catch (error) {
    console.error('Failed to list calibration register', error);
    return [];
  }
}
