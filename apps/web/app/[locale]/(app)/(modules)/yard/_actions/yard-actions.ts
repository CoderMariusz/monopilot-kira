'use server';

import { Dec } from '@monopilot/domain';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import type {
  AppointmentDirection,
  AppointmentRow,
  AppointmentStatus,
  BookAppointmentInput,
  DockDoorDirection,
  DockDoorRow,
  GateInInput,
  ListAppointmentsInput,
  RecordWeighingInput,
  UpsertDockDoorInput,
  VisitStatus,
  WeighingRow,
  YardVisitRow,
} from './yard-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type YardActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ActionError<Code extends string> = { error: Code };

type DateLike = string | Date;

type DockDoorDbRow = {
  id: string;
  site_id: string | null;
  warehouse_id: string | null;
  code: string;
  name: string | null;
  direction: string;
  is_active: boolean;
};

type AppointmentDbRow = {
  id: string;
  site_id: string | null;
  dock_door_id: string;
  dock_door_code: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  direction: string;
  reference: string | null;
  scheduled_at: DateLike;
  duration_min: number | string;
  status: string;
  notes: string | null;
};

type YardVisitDbRow = {
  id: string;
  site_id: string | null;
  dock_appointment_id: string | null;
  appointment_reference: string | null;
  dock_door_code: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  vehicle_reg: string;
  trailer_ref: string | null;
  driver_name: string | null;
  gate_in_at: DateLike;
  gate_out_at: DateLike | null;
  status: string;
};

type WeighingDbRow = {
  id: string;
  yard_visit_id: string;
  gross_kg: string | number;
  tare_kg: string | number;
  net_kg: string | number;
  weighed_at: DateLike;
  weighed_by: string;
};

const YARD_PERMISSION = 'npd.planning.write';
const MAX_WEIGHT_KG_ABS = 1e15;
const APPOINTMENT_STATUSES = new Set<string>(['scheduled', 'arrived', 'completed', 'cancelled', 'no_show']);
const DOCK_DOOR_DIRECTIONS = new Set<string>(['inbound', 'outbound', 'both']);
const APPOINTMENT_DIRECTIONS = new Set<string>(['inbound', 'outbound']);

function toIso(value: DateLike): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toNullableIso(value: DateLike | null): string | null {
  return value === null ? null : toIso(value);
}

function toNullableTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireTrimmed(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} is required`);
  return trimmed;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function requireValidDate(value: string, field: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid date-time`);
  return date.toISOString();
}

function requireDockDoorDirection(value: DockDoorDirection): DockDoorDirection {
  if (!DOCK_DOOR_DIRECTIONS.has(value)) throw new Error('direction is invalid');
  return value;
}

function requireAppointmentDirection(value: AppointmentDirection): AppointmentDirection {
  if (!APPOINTMENT_DIRECTIONS.has(value)) throw new Error('direction is invalid');
  return value;
}

function requireAppointmentStatus(value: AppointmentStatus): AppointmentStatus {
  if (!APPOINTMENT_STATUSES.has(value)) throw new Error('status is invalid');
  return value;
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function decimalNumber(value: string): Dec {
  return Dec.from(String(value));
}

function formatWeightDecimal(value: number): string {
  return value.toFixed(10);
}

function invalidWeight(): ActionError<'invalid_weight'> {
  return { error: 'invalid_weight' };
}

function validatedWeightDecimals(
  grossKg: number,
  tareKg: number,
): { grossKg: string; tareKg: string; netKg: string } | ActionError<'invalid_weight'> {
  if (!Number.isFinite(grossKg) || !Number.isFinite(tareKg)) return invalidWeight();
  if (grossKg < 0 || tareKg < 0 || grossKg < tareKg) return invalidWeight();
  if (Math.abs(grossKg) >= MAX_WEIGHT_KG_ABS || Math.abs(tareKg) >= MAX_WEIGHT_KG_ABS) return invalidWeight();

  const grossKgDecimal = formatWeightDecimal(grossKg);
  const tareKgDecimal = formatWeightDecimal(tareKg);
  return {
    grossKg: grossKgDecimal,
    tareKg: tareKgDecimal,
    netKg: netKgDecimal(grossKgDecimal, tareKgDecimal),
  };
}

function netKgDecimal(grossKg: string, tareKg: string): string {
  return decimalNumber(grossKg).sub(decimalNumber(tareKg)).toFixed(3);
}

async function hasYardPermission(ctx: YardActionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, YARD_PERMISSION],
  );
  return rows.length > 0;
}

async function requireYardPermission(ctx: YardActionContext): Promise<void> {
  if (!(await hasYardPermission(ctx))) throw new Error('forbidden');
}

function mapDockDoor(row: DockDoorDbRow): DockDoorRow {
  return {
    id: row.id,
    siteId: row.site_id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    direction: row.direction as DockDoorDirection,
    isActive: Boolean(row.is_active),
  };
}

function mapAppointment(row: AppointmentDbRow): AppointmentRow {
  return {
    id: row.id,
    siteId: row.site_id,
    dockDoorId: row.dock_door_id,
    dockDoorCode: row.dock_door_code,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    direction: row.direction as AppointmentDirection,
    reference: row.reference,
    scheduledAt: toIso(row.scheduled_at),
    durationMin: Number(row.duration_min),
    status: row.status as AppointmentStatus,
    notes: row.notes,
  };
}

function mapYardVisit(row: YardVisitDbRow): YardVisitRow {
  return {
    id: row.id,
    siteId: row.site_id,
    appointmentId: row.dock_appointment_id,
    appointmentReference: row.appointment_reference,
    dockDoorCode: row.dock_door_code,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    vehicleReg: row.vehicle_reg,
    trailerRef: row.trailer_ref,
    driverName: row.driver_name,
    gateInAt: toIso(row.gate_in_at),
    gateOutAt: toNullableIso(row.gate_out_at),
    status: row.status as VisitStatus,
  };
}

function mapWeighing(row: WeighingDbRow): WeighingRow {
  return {
    id: row.id,
    yardVisitId: row.yard_visit_id,
    grossKg: toNumber(row.gross_kg),
    tareKg: toNumber(row.tare_kg),
    netKg: toNumber(row.net_kg),
    weighedAt: toIso(row.weighed_at),
    weighedBy: row.weighed_by,
  };
}

async function readAppointment(
  client: QueryClient,
  appointmentId: string,
): Promise<{ carrier_id: string | null; site_id: string | null; status: string } | null> {
  const { rows } = await client.query<{ carrier_id: string | null; site_id: string | null; status: string }>(
    `select carrier_id, site_id, status
       from public.dock_appointments
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

async function readYardVisit(client: QueryClient, yardVisitId: string): Promise<YardVisitRow> {
  const { rows } = await client.query<YardVisitDbRow>(
    `select yv.id,
            yv.site_id,
            yv.dock_appointment_id,
            da.reference as appointment_reference,
            dd.code as dock_door_code,
            yv.carrier_id,
            c.name as carrier_name,
            yv.vehicle_reg,
            yv.trailer_ref,
            yv.driver_name,
            yv.gate_in_at,
            yv.gate_out_at,
            yv.status
       from public.yard_visits yv
       left join public.dock_appointments da
         on da.org_id = yv.org_id
        and da.id = yv.dock_appointment_id
       left join public.dock_doors dd
         on dd.org_id = yv.org_id
        and dd.id = da.dock_door_id
       left join public.carriers c
         on c.org_id = yv.org_id
        and c.id = yv.carrier_id
      where yv.org_id = app.current_org_id()
        and yv.id = $1::uuid
      limit 1`,
    [yardVisitId],
  );
  const row = rows[0];
  if (!row) throw new Error('yard visit not found');
  return mapYardVisit(row);
}

export async function listDockDoors(): Promise<DockDoorRow[]> {
  return await withOrgContext(async ({ userId, orgId, client }): Promise<DockDoorRow[]> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);
    const { rows } = await ctx.client.query<DockDoorDbRow>(
      `select id, site_id, warehouse_id, code, name, direction, is_active
         from public.dock_doors
        where org_id = app.current_org_id()
        order by code asc`,
    );
    return rows.map(mapDockDoor);
  });
}

export async function upsertDockDoor(input: UpsertDockDoorInput): Promise<DockDoorRow> {
  const code = requireTrimmed(input.code, 'code');
  const name = toNullableTrimmed(input.name);
  const direction = requireDockDoorDirection(input.direction);
  const siteId = input.siteId ?? null;
  const warehouseId = input.warehouseId ?? null;
  const isActive = input.isActive ?? true;

  return await withOrgContext(async ({ userId, orgId, client }): Promise<DockDoorRow> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);

    const { rows } = input.id
      ? await ctx.client.query<DockDoorDbRow>(
          `update public.dock_doors
              set code = $1,
                  name = $2,
                  direction = $3,
                  warehouse_id = $4::uuid,
                  site_id = $5::uuid,
                  is_active = $6
            where org_id = app.current_org_id()
              and id = $7::uuid
          returning id, site_id, warehouse_id, code, name, direction, is_active`,
          [code, name, direction, warehouseId, siteId, isActive, input.id],
        )
      : await ctx.client.query<DockDoorDbRow>(
          `insert into public.dock_doors
             (org_id, code, name, direction, warehouse_id, site_id, is_active)
           values
             (app.current_org_id(), $1, $2, $3, $4::uuid, $5::uuid, $6)
           returning id, site_id, warehouse_id, code, name, direction, is_active`,
          [code, name, direction, warehouseId, siteId, isActive],
        );

    const row = rows[0];
    if (!row) throw new Error(input.id ? 'dock door not found' : 'dock door not saved');
    return mapDockDoor(row);
  });
}

export async function listAppointments(input: ListAppointmentsInput): Promise<AppointmentRow[]> {
  const from = requireValidDate(input.from, 'from');
  const to = requireValidDate(input.to, 'to');
  if (new Date(from).getTime() >= new Date(to).getTime()) throw new Error('from must be before to');

  return await withOrgContext(async ({ userId, orgId, client }): Promise<AppointmentRow[]> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);
    const { rows } = await ctx.client.query<AppointmentDbRow>(
      `select da.id,
              da.site_id,
              da.dock_door_id,
              dd.code as dock_door_code,
              da.carrier_id,
              c.name as carrier_name,
              da.direction,
              da.reference,
              da.scheduled_at,
              da.duration_min,
              da.status,
              da.notes
         from public.dock_appointments da
         left join public.dock_doors dd
           on dd.org_id = da.org_id
          and dd.id = da.dock_door_id
         left join public.carriers c
           on c.org_id = da.org_id
          and c.id = da.carrier_id
        where da.org_id = app.current_org_id()
          and da.scheduled_at >= $1::timestamptz
          and da.scheduled_at < $2::timestamptz
        order by da.scheduled_at asc, dd.code asc`,
      [from, to],
    );
    return rows.map(mapAppointment);
  });
}

export async function bookAppointment(input: BookAppointmentInput): Promise<AppointmentRow> {
  const direction = requireAppointmentDirection(input.direction);
  const scheduledAt = requireValidDate(input.scheduledAt, 'scheduledAt');
  const durationMin = requirePositiveInteger(input.durationMin, 'durationMin');
  const reference = toNullableTrimmed(input.reference);

  return await withOrgContext(async ({ userId, orgId, client }): Promise<AppointmentRow> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);

    // TODO: TOCTOU: a DB GIST EXCLUDE constraint on (dock_id, tsrange) is the only race-safe guard — add as a separate migration.
    const overlap = await ctx.client.query<{ id: string }>(
      `select id
         from public.dock_appointments
        where org_id = app.current_org_id()
          and dock_door_id = $1::uuid
          and status not in ('cancelled', 'no_show')
          and tstzrange(scheduled_at, scheduled_at + (duration_min || ' minutes')::interval, '[)')
              && tstzrange($2::timestamptz, $2::timestamptz + ($3::integer || ' minutes')::interval, '[)')
        limit 1`,
      [input.dockDoorId, scheduledAt, durationMin],
    );
    if (overlap.rows.length > 0) throw new Error('dock appointment overlaps an existing non-cancelled appointment');

    const { rows } = await ctx.client.query<AppointmentDbRow>(
      `insert into public.dock_appointments
         (org_id, site_id, dock_door_id, carrier_id, direction, reference, scheduled_at, duration_min, status)
       select app.current_org_id(),
              dd.site_id,
              dd.id,
              $2::uuid,
              $3,
              $4,
              $5::timestamptz,
              $6::integer,
              'scheduled'
         from public.dock_doors dd
        where dd.org_id = app.current_org_id()
          and dd.id = $1::uuid
       returning id,
                 site_id,
                 dock_door_id,
                 (select code from public.dock_doors where org_id = app.current_org_id() and id = dock_door_id) as dock_door_code,
                 carrier_id,
                 (select name from public.carriers where org_id = app.current_org_id() and id = carrier_id) as carrier_name,
                 direction,
                 reference,
                 scheduled_at,
                 duration_min,
                 status,
                 notes`,
      [input.dockDoorId, input.carrierId ?? null, direction, reference, scheduledAt, durationMin],
    );

    const row = rows[0];
    if (!row) throw new Error('dock door not found');
    return mapAppointment(row);
  });
}

export async function setAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<AppointmentRow> {
  const nextStatus = requireAppointmentStatus(status);

  return await withOrgContext(async ({ userId, orgId, client }): Promise<AppointmentRow> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);
    const { rows } = await ctx.client.query<AppointmentDbRow>(
      `update public.dock_appointments da
          set status = $2
        where da.org_id = app.current_org_id()
          and da.id = $1::uuid
      returning da.id,
                da.site_id,
                da.dock_door_id,
                (select code from public.dock_doors dd where dd.org_id = da.org_id and dd.id = da.dock_door_id) as dock_door_code,
                da.carrier_id,
                (select name from public.carriers c where c.org_id = da.org_id and c.id = da.carrier_id) as carrier_name,
                da.direction,
                da.reference,
                da.scheduled_at,
                da.duration_min,
                da.status,
                da.notes`,
      [appointmentId, nextStatus],
    );
    const row = rows[0];
    if (!row) throw new Error('appointment not found');
    return mapAppointment(row);
  });
}

export async function gateIn(
  input: GateInInput,
): Promise<YardVisitRow> {
  const vehicleReg = requireTrimmed(input.vehicleReg, 'vehicleReg');
  const trailerRef = toNullableTrimmed(input.trailerRef);
  const driverName = toNullableTrimmed(input.driverName);
  const appointmentId = input.appointmentId ?? null;

  return await withOrgContext(
    async ({ userId, orgId, client }): Promise<YardVisitRow> => {
      const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
      await requireYardPermission(ctx);

      let carrierId = input.carrierId ?? null;
      let siteId: string | null = null;

      if (appointmentId) {
        const appointment = await readAppointment(ctx.client, appointmentId);
        if (!appointment) throw new Error('appointment not found');
        if (appointment.status === 'cancelled') {
          return { error: 'appointment_cancelled' } as unknown as YardVisitRow;
        }

        const existingVisit = await ctx.client.query<{ id: string }>(
          `select id
             from public.yard_visits
            where org_id = app.current_org_id()
              and dock_appointment_id = $1::uuid
              and status in ('arrived', 'on_site', 'completed')
            limit 1`,
          [appointmentId],
        );
        if (existingVisit.rows.length > 0) return { error: 'already_arrived' } as unknown as YardVisitRow;

        carrierId = carrierId ?? appointment.carrier_id;
        siteId = appointment.site_id;
      }

      const { rows } = await ctx.client.query<{ id: string }>(
        `insert into public.yard_visits
           (org_id, site_id, dock_appointment_id, carrier_id, vehicle_reg, trailer_ref, driver_name, gate_in_at, status)
         values
           (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, now(), 'on_site')
         returning id`,
        [siteId, appointmentId, carrierId, vehicleReg, trailerRef, driverName],
      );

      const visitId = rows[0]?.id;
      if (!visitId) throw new Error('yard visit not saved');

      if (appointmentId) {
        await ctx.client.query(
          `update public.dock_appointments
            set status = 'arrived'
          where org_id = app.current_org_id()
            and id = $1::uuid`,
          [appointmentId],
        );
      }

      return await readYardVisit(ctx.client, visitId);
    },
  );
}

export async function gateOut(yardVisitId: string): Promise<YardVisitRow> {
  return await withOrgContext(
    async ({ userId, orgId, client }): Promise<YardVisitRow> => {
      const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
      await requireYardPermission(ctx);

      const updated = await ctx.client.query<{ id: string }>(
        `update public.yard_visits
          set gate_out_at = now(),
              status = 'departed'
        where org_id = app.current_org_id()
          and id = $1::uuid
          and gate_out_at is null
      returning id`,
        [yardVisitId],
      );
      if ((updated.rowCount ?? updated.rows.length) === 0) {
        const existingVisit = await ctx.client.query<{ id: string }>(
          `select id
           from public.yard_visits
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
          [yardVisitId],
        );
        return (existingVisit.rows.length > 0 ? { error: 'already_departed' } : { error: 'not_found' }) as unknown as YardVisitRow;
      }
      return await readYardVisit(ctx.client, yardVisitId);
    },
  );
}

export async function listYardVisits(): Promise<YardVisitRow[]> {
  return await withOrgContext(async ({ userId, orgId, client }): Promise<YardVisitRow[]> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);

    const { rows } = await ctx.client.query<YardVisitDbRow>(
      `select yv.id,
              yv.site_id,
              yv.dock_appointment_id,
              da.reference as appointment_reference,
              dd.code as dock_door_code,
              yv.carrier_id,
              c.name as carrier_name,
              yv.vehicle_reg,
              yv.trailer_ref,
              yv.driver_name,
              yv.gate_in_at,
              yv.gate_out_at,
              yv.status
         from public.yard_visits yv
         left join public.dock_appointments da
           on da.org_id = yv.org_id
          and da.id = yv.dock_appointment_id
         left join public.dock_doors dd
           on dd.org_id = yv.org_id
          and dd.id = da.dock_door_id
         left join public.carriers c
           on c.org_id = yv.org_id
          and c.id = yv.carrier_id
        where yv.org_id = app.current_org_id()
          and (
            yv.status = 'on_site'
            or yv.gate_out_at >= now() - interval '24 hours'
          )
        order by case when yv.status = 'on_site' then 0 else 1 end,
                 yv.gate_in_at desc`,
    );
    return rows.map(mapYardVisit);
  });
}

export async function recordWeighing(input: RecordWeighingInput): Promise<WeighingRow> {
  const weights = validatedWeightDecimals(input.grossKg, input.tareKg);
  if ('error' in weights) return weights as unknown as WeighingRow;

  return await withOrgContext(async ({ userId, orgId, client }): Promise<WeighingRow> => {
    const ctx: YardActionContext = { userId, orgId, client: client as QueryClient };
    await requireYardPermission(ctx);

    const { rows } = await ctx.client.query<WeighingDbRow>(
      `insert into public.weighings
         (org_id, yard_visit_id, gross_kg, tare_kg, net_kg, weighed_at, weighed_by)
       values
         (app.current_org_id(), $1::uuid, $2::numeric, $3::numeric, $4::numeric, now(), $5::uuid)
       returning id, yard_visit_id, gross_kg, tare_kg, net_kg, weighed_at, weighed_by`,
      [input.yardVisitId, weights.grossKg, weights.tareKg, weights.netKg, userId],
    );

    const row = rows[0];
    if (!row) throw new Error('weighing not saved');
    return mapWeighing(row);
  });
}
