'use server';

/**
 * 13-MAINTENANCE — calibration instrument CRUD + record writers (F4-H2).
 *
 * Schema: migration 201 (calibration_instruments, calibration_records) — no new
 * migration this lane. RBAC from migration 202 seed:
 *   read/list            → mnt.asset.read
 *   create/update        → mnt.asset.edit
 *   deactivate           → mnt.asset.deactivate
 *   record calibration   → mnt.calib.record
 *
 * FAIL result: sets calibration_instruments.active = false (schema has no
 * out_of_service column — active is the follow-up marker).
 *
 * E-sign: CFR-21 Part 11 PIN/password via signEvent (intent mnt.calib.record)
 * before persisting the immutable calibration record; certificate_sha256 stores
 * the subject hash. Dual reviewer sign is T-015 follow-up.
 */

import type pg from 'pg';
import { EPinFailedError, ESignPolicyError, signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  createInstrumentSchema,
  deactivateInstrumentSchema,
  reactivateInstrumentSchema,
  recordCalibrationSchema,
  updateInstrumentSchema,
  type CalibrationPermissions,
  type InstrumentOption,
} from '../_types/calibration-schemas';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type CalibrationContext = { userId: string; orgId: string; client: QueryClient };

/** packages/db/migrations/202-maintenance-outbox-and-rbac-seed.sql:196 */
const MNT_READ_PERMISSION = 'mnt.asset.read';
/** packages/db/migrations/202-maintenance-outbox-and-rbac-seed.sql:197 */
const MNT_EDIT_PERMISSION = 'mnt.asset.edit';
/** packages/db/migrations/202-maintenance-outbox-and-rbac-seed.sql:198 */
const MNT_DEACTIVATE_PERMISSION = 'mnt.asset.deactivate';
/** packages/db/migrations/202-maintenance-outbox-and-rbac-seed.sql:207 */
const MNT_CALIB_RECORD_PERMISSION = 'mnt.calib.record';

type ActionFailure = {
  ok: false;
  reason: 'forbidden' | 'not_found' | 'validation_error' | 'conflict' | 'esign_failed' | 'error';
  message?: string;
};
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

function computeNextDueDate(calibratedAt: Date, intervalDays: number): string {
  const next = new Date(calibratedAt);
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next.toISOString().slice(0, 10);
}

function calibratedAtDateOnly(calibratedAt: Date): string {
  return calibratedAt.toISOString().slice(0, 10);
}

function isFailureResult(result: 'PASS' | 'FAIL' | 'OUT_OF_SPEC'): boolean {
  return result === 'FAIL' || result === 'OUT_OF_SPEC';
}

function isFutureCalibratedAt(calibratedAt: Date): boolean {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const calibratedUtc = Date.UTC(
    calibratedAt.getUTCFullYear(),
    calibratedAt.getUTCMonth(),
    calibratedAt.getUTCDate(),
  );
  return calibratedUtc > todayUtc;
}

function parseCalibratedAt(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }
  return new Date(value);
}

async function writeCalibrationOutbox(
  ctx: CalibrationContext,
  params: {
    eventType: 'maintenance.calibration.completed' | 'maintenance.calibration.failed';
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, 'calibration_record', $2::uuid, $3::jsonb, 'calibration-writers-v1')`,
    [
      params.eventType,
      params.aggregateId,
      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...params.payload }),
    ],
  );
}

export async function getCalibrationPermissions(): Promise<CalibrationPermissions> {
  try {
    return await withOrgContext(async (ctx: CalibrationContext): Promise<CalibrationPermissions> => {
      const [canRead, canEditInstrument, canDeactivateInstrument, canRecord] = await Promise.all([
        hasPermission(ctx, MNT_READ_PERMISSION),
        hasPermission(ctx, MNT_EDIT_PERMISSION),
        hasPermission(ctx, MNT_DEACTIVATE_PERMISSION),
        hasPermission(ctx, MNT_CALIB_RECORD_PERMISSION),
      ]);
      return { canRead, canEditInstrument, canDeactivateInstrument, canRecord };
    });
  } catch (err) {
    console.error('[calibration] getCalibrationPermissions failed', err);
    return {
      canRead: false,
      canEditInstrument: false,
      canDeactivateInstrument: false,
      canRecord: false,
    };
  }
}

export async function listActiveInstruments(): Promise<ActionResult<InstrumentOption[]>> {
  try {
    return await withOrgContext(async (ctx: CalibrationContext): Promise<ActionResult<InstrumentOption[]>> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const { rows } = await ctx.client.query<{
        id: string;
        instrument_code: string;
        instrument_type: string;
        standard: string;
        calibration_interval_days: number;
        active: boolean;
      }>(
        `select id::text,
                instrument_code,
                instrument_type,
                standard,
                calibration_interval_days,
                active
           from public.calibration_instruments
          where org_id = app.current_org_id()
          order by instrument_code asc`,
      );

      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          instrumentCode: r.instrument_code,
          instrumentType: r.instrument_type,
          standard: r.standard,
          calibrationIntervalDays: r.calibration_interval_days,
          active: r.active,
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createInstrument(input: {
  instrumentCode: string;
  instrumentType: 'scale' | 'thermometer' | 'ph_meter' | 'other';
  standard: 'ISO_9001' | 'NIST' | 'internal' | 'other';
  calibrationIntervalDays: number;
  rangeMin?: string;
  rangeMax?: string;
  unitOfMeasure?: string;
}): Promise<ActionResult<{ instrumentId: string }>> {
  try {
    const parsed = createInstrumentSchema.parse(input);
    return await withOrgContext(async (ctx: CalibrationContext): Promise<ActionResult<{ instrumentId: string }>> => {
      if (!(await hasPermission(ctx, MNT_EDIT_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      try {
        const inserted = await ctx.client.query<{ id: string }>(
          `insert into public.calibration_instruments (
             org_id, instrument_code, instrument_type, standard,
             range_min, range_max, unit_of_measure, calibration_interval_days,
             active, created_by, updated_by
           )
           values (
             app.current_org_id(), $1, $2, $3,
             $4::numeric, $5::numeric, $6, $7,
             true, $8::uuid, $8::uuid
           )
           returning id::text`,
          [
            parsed.instrumentCode,
            parsed.instrumentType,
            parsed.standard,
            parsed.rangeMin ?? null,
            parsed.rangeMax ?? null,
            parsed.unitOfMeasure ?? null,
            parsed.calibrationIntervalDays,
            ctx.userId,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error('instrument insert returned no row');

        revalidateLocalized('/maintenance/calibration');
        return { ok: true, data: { instrumentId: row.id } };
      } catch (err) {
        if (err instanceof Error && err.message.includes('calibration_instruments_org_code_uq')) {
          return { ok: false, reason: 'conflict', message: 'instrument code already exists' };
        }
        throw err;
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateInstrument(input: {
  instrumentId: string;
  instrumentCode: string;
  instrumentType: 'scale' | 'thermometer' | 'ph_meter' | 'other';
  standard: 'ISO_9001' | 'NIST' | 'internal' | 'other';
  calibrationIntervalDays: number;
  rangeMin?: string;
  rangeMax?: string;
  unitOfMeasure?: string;
}): Promise<ActionResult<{ instrumentId: string }>> {
  try {
    const parsed = updateInstrumentSchema.parse(input);
    return await withOrgContext(async (ctx: CalibrationContext): Promise<ActionResult<{ instrumentId: string }>> => {
      if (!(await hasPermission(ctx, MNT_EDIT_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      try {
        const updated = await ctx.client.query<{ id: string }>(
          `update public.calibration_instruments
              set instrument_code = $2,
                  instrument_type = $3,
                  standard = $4,
                  range_min = $5::numeric,
                  range_max = $6::numeric,
                  unit_of_measure = $7,
                  calibration_interval_days = $8,
                  updated_by = $9::uuid,
                  updated_at = pg_catalog.now()
            where id = $1::uuid
              and org_id = app.current_org_id()
          returning id::text`,
          [
            parsed.instrumentId,
            parsed.instrumentCode,
            parsed.instrumentType,
            parsed.standard,
            parsed.rangeMin ?? null,
            parsed.rangeMax ?? null,
            parsed.unitOfMeasure ?? null,
            parsed.calibrationIntervalDays,
            ctx.userId,
          ],
        );
        const row = updated.rows[0];
        if (!row) return { ok: false, reason: 'not_found' };

        revalidateLocalized('/maintenance/calibration');
        return { ok: true, data: { instrumentId: row.id } };
      } catch (err) {
        if (err instanceof Error && err.message.includes('calibration_instruments_org_code_uq')) {
          return { ok: false, reason: 'conflict', message: 'instrument code already exists' };
        }
        throw err;
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deactivateInstrument(input: {
  instrumentId: string;
}): Promise<ActionResult<{ instrumentId: string }>> {
  try {
    const parsed = deactivateInstrumentSchema.parse(input);
    return await withOrgContext(async (ctx: CalibrationContext): Promise<ActionResult<{ instrumentId: string }>> => {
      if (!(await hasPermission(ctx, MNT_DEACTIVATE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const updated = await ctx.client.query<{ id: string }>(
        `update public.calibration_instruments
            set active = false,
                updated_by = $2::uuid,
                updated_at = pg_catalog.now()
          where id = $1::uuid
            and org_id = app.current_org_id()
        returning id::text`,
        [parsed.instrumentId, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      revalidateLocalized('/maintenance/calibration');
      return { ok: true, data: { instrumentId: row.id } };
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function reactivateInstrument(input: {
  instrumentId: string;
}): Promise<ActionResult<{ instrumentId: string }>> {
  try {
    const parsed = reactivateInstrumentSchema.parse(input);
    return await withOrgContext(async (ctx: CalibrationContext): Promise<ActionResult<{ instrumentId: string }>> => {
      if (!(await hasPermission(ctx, MNT_EDIT_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const updated = await ctx.client.query<{ id: string }>(
        `update public.calibration_instruments
            set active = true,
                updated_by = $2::uuid,
                updated_at = pg_catalog.now()
          where id = $1::uuid
            and org_id = app.current_org_id()
        returning id::text`,
        [parsed.instrumentId, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      revalidateLocalized('/maintenance/calibration');
      return { ok: true, data: { instrumentId: row.id } };
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordCalibration(input: {
  instrumentId: string;
  calibratedAt: string;
  result: 'PASS' | 'FAIL' | 'OUT_OF_SPEC';
  testPoints?: Array<{ reference: string; measured: string | number; tolerance_pct?: number }>;
  notes?: string;
  certificateRef?: string;
  signature: { password: string; nonce?: string };
}): Promise<ActionResult<{ recordId: string; nextDueDate: string }>> {
  try {
    const parsed = recordCalibrationSchema.parse(input);
    return await withOrgContext(
      async (ctx: CalibrationContext): Promise<ActionResult<{ recordId: string; nextDueDate: string }>> => {
        if (!(await hasPermission(ctx, MNT_CALIB_RECORD_PERMISSION))) {
          return { ok: false, reason: 'forbidden' };
        }

        const instrument = await ctx.client.query<{
          id: string;
          standard: string;
          calibration_interval_days: number;
          instrument_code: string;
          active: boolean;
        }>(
          `select id::text, standard, calibration_interval_days, instrument_code, active
             from public.calibration_instruments
            where id = $1::uuid
              and org_id = app.current_org_id()
            limit 1`,
          [parsed.instrumentId],
        );
        const instrumentRow = instrument.rows[0];
        if (!instrumentRow) return { ok: false, reason: 'not_found' };

        const calibratedAt = parseCalibratedAt(parsed.calibratedAt);
        if (isFutureCalibratedAt(calibratedAt)) {
          return {
            ok: false,
            reason: 'validation_error',
            message: 'calibratedAt cannot be in the future',
          };
        }

        if (isFailureResult(parsed.result) && !instrumentRow.active) {
          return {
            ok: false,
            reason: 'validation_error',
            message: 'instrument must be active to record a failing calibration',
          };
        }

        const nextDueDate = isFailureResult(parsed.result)
          ? calibratedAtDateOnly(calibratedAt)
          : computeNextDueDate(calibratedAt, instrumentRow.calibration_interval_days);
        const testPointsJson = JSON.stringify(parsed.testPoints ?? []);

        let signatureHash: string;
        try {
          const receipt = await signEvent(
            {
              signerUserId: ctx.userId,
              pin: parsed.signature.password,
              intent: 'mnt.calib.record',
              subject: {
                instrumentId: parsed.instrumentId,
                result: parsed.result,
                calibratedAt: calibratedAt.toISOString(),
              },
              reason: parsed.result,
              nonce: parsed.signature.nonce,
            },
            { client: ctx.client as unknown as pg.PoolClient },
          );
          signatureHash = receipt.subjectHash;
        } catch (err) {
          if (err instanceof EPinFailedError || err instanceof ESignPolicyError) {
            return { ok: false, reason: 'esign_failed', message: err.message };
          }
          throw err;
        }

        const inserted = await ctx.client.query<{ id: string }>(
          `insert into public.calibration_records (
             org_id, instrument_id, calibrated_at, calibrated_by,
             standard_applied, test_points, result, certificate_file_url,
             certificate_sha256, next_due_date, notes, created_by
           )
           values (
             app.current_org_id(), $1::uuid, $2::timestamptz, $3::uuid,
             $4, $5::jsonb, $6, $7,
             $8, $9::date, $10, $3::uuid
           )
           returning id::text`,
          [
            parsed.instrumentId,
            calibratedAt.toISOString(),
            ctx.userId,
            instrumentRow.standard,
            testPointsJson,
            parsed.result,
            parsed.certificateRef ?? null,
            signatureHash,
            nextDueDate,
            parsed.notes ?? null,
          ],
        );
        const recordRow = inserted.rows[0];
        if (!recordRow) throw new Error('calibration record insert returned no row');

        if (isFailureResult(parsed.result)) {
          await ctx.client.query(
            `update public.calibration_instruments
                set active = false,
                    updated_by = $2::uuid,
                    updated_at = pg_catalog.now()
              where id = $1::uuid
                and org_id = app.current_org_id()`,
            [parsed.instrumentId, ctx.userId],
          );
        } else if (parsed.result === 'PASS' && !instrumentRow.active) {
          await ctx.client.query(
            `update public.calibration_instruments
                set active = true,
                    updated_by = $2::uuid,
                    updated_at = pg_catalog.now()
              where id = $1::uuid
                and org_id = app.current_org_id()`,
            [parsed.instrumentId, ctx.userId],
          );
        }

        const eventType = isFailureResult(parsed.result)
          ? ('maintenance.calibration.failed' as const)
          : ('maintenance.calibration.completed' as const);

        await writeCalibrationOutbox(ctx, {
          eventType,
          aggregateId: recordRow.id,
          payload: {
            record_id: recordRow.id,
            instrument_id: parsed.instrumentId,
            instrument_code: instrumentRow.instrument_code,
            result: parsed.result,
            calibrated_at: calibratedAt.toISOString(),
            next_due_date: nextDueDate,
          },
        });

        revalidateLocalized('/maintenance/calibration');
        return { ok: true, data: { recordId: recordRow.id, nextDueDate } };
      },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
