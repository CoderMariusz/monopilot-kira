'use server';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

import type { CalibrationReviewerOption } from './calibration-esign';
import type { CalibrationDueRow } from '../_types/calibration-schemas';

/** Maintenance register read — seeded in packages/db/migrations/202-maintenance-outbox-and-rbac-seed.sql:196 */
const MNT_READ_PERMISSION = 'mnt.asset.read';
const MNT_CALIB_RECORD_PERMISSION = 'mnt.calib.record';
const REVIEWER_SUPER_ROLES = ['owner', 'admin', 'org_admin'] as const;

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
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CalibrationDueRow[]> => {
      if (!(await hasPermission({ userId, orgId, client: client as QueryClient }, MNT_READ_PERMISSION))) {
        return [];
      }

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
            case
              when calibrator.id is null then null
              else calibrator.name || ' · ' || calibrator.email::text
            end as calibrated_by,
            cr.standard_applied,
            cr.result,
            cr.certificate_file_url,
            cr.next_due_date,
            case
              when reviewer.id is null then null
              else reviewer.name || ' · ' || reviewer.email::text
            end as reviewer_signed_by,
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
           left join public.users calibrator
             on calibrator.id = cr.calibrated_by
            and calibrator.org_id = ci.org_id
           left join public.users reviewer
             on reviewer.id = cr.reviewer_signed_by
            and reviewer.org_id = ci.org_id
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

/** Active, eligible, non-self reviewers resolved to readable identities. */
export async function listCalibrationReviewers(): Promise<CalibrationReviewerOption[]> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CalibrationReviewerOption[]> => {
      if (!(await hasPermission({ userId, orgId, client: client as QueryClient }, MNT_READ_PERMISSION))) {
        return [];
      }

      const { rows } = await (client as QueryClient).query<CalibrationReviewerOption>(
        `select u.id::text, u.name, u.email::text
           from public.users u
          where u.org_id = app.current_org_id()
            and u.id <> $1::uuid
            and u.is_active = true
            and u.deleted_at is null
            and exists (
              select 1
                from public.user_roles ur
                join public.roles r
                  on r.id = ur.role_id
                 and r.org_id = ur.org_id
                left join public.role_permissions rp
                  on rp.role_id = r.id
                 and rp.permission = $2
               where ur.org_id = app.current_org_id()
                 and ur.user_id = u.id
                 and (
                   rp.permission is not null
                   or coalesce(r.permissions, '[]'::jsonb) ? $2
                   or r.code = any($3::text[])
                   or r.slug = any($3::text[])
                 )
            )
          order by pg_catalog.lower(u.name), pg_catalog.lower(u.email::text)`,
        [userId, MNT_CALIB_RECORD_PERMISSION, REVIEWER_SUPER_ROLES],
      );
      return rows;
    });
  } catch (error) {
    console.error('Failed to list calibration reviewers', error);
    return [];
  }
}
