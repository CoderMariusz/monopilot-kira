import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookAppointment, gateIn, gateOut, recordWeighing } from '../yard-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type Appointment = {
  id: string;
  site_id: string | null;
  dock_door_id: string;
  dock_door_code: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  direction: 'inbound' | 'outbound';
  reference: string | null;
  scheduled_at: string;
  duration_min: number;
  status: 'scheduled' | 'arrived' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
};

type YardVisit = {
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
  gate_in_at: string;
  gate_out_at: string | null;
  status: 'arrived' | 'on_site' | 'completed' | 'departed';
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DOOR_A_ID = '33333333-3333-4333-8333-333333333333';
const DOOR_B_ID = '44444444-4444-4444-8444-444444444444';
const CARRIER_ID = '55555555-5555-4555-8555-555555555555';
const APPOINTMENT_ID = '66666666-6666-4666-8666-666666666666';
const VISIT_ID = '77777777-7777-4777-8777-777777777777';
const WEIGHING_ID = '88888888-8888-4888-8888-888888888888';
const SITE_ID = '99999999-9999-4999-8999-999999999999';
const UNKNOWN_VISIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let client: QueryClient;
let appointments: Appointment[];
let visits: YardVisit[];
let weighingParams: readonly unknown[] | null;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function overlaps(startA: string, durationA: number, startB: string, durationB: number): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = aStart + durationA * 60_000;
  const bStart = new Date(startB).getTime();
  const bEnd = bStart + durationB * 60_000;
  return aStart < bEnd && bStart < aEnd;
}

function appointmentRow(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: APPOINTMENT_ID,
    site_id: SITE_ID,
    dock_door_id: DOOR_A_ID,
    dock_door_code: 'D-A',
    carrier_id: CARRIER_ID,
    carrier_name: 'North Freight',
    direction: 'inbound',
    reference: 'REF-1',
    scheduled_at: '2026-06-24T10:00:00.000Z',
    duration_min: 60,
    status: 'scheduled',
    notes: null,
    ...overrides,
  };
}

function visitRow(overrides: Partial<YardVisit> = {}): YardVisit {
  return {
    id: VISIT_ID,
    site_id: SITE_ID,
    dock_appointment_id: APPOINTMENT_ID,
    appointment_reference: 'REF-1',
    dock_door_code: 'D-A',
    carrier_id: CARRIER_ID,
    carrier_name: 'North Freight',
    vehicle_reg: 'WX12 ABC',
    trailer_ref: null,
    driver_name: null,
    gate_in_at: '2026-06-24T09:55:00.000Z',
    gate_out_at: null,
    status: 'on_site',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        // Stale test contract: yard actions now gate on the module-specific yard.manage permission.
        expect(params).toEqual([USER_ID, ORG_ID, 'yard.manage']);
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (q.startsWith('select id from public.dock_appointments')) {
        const [doorId, scheduledAt, durationMin] = params as [string, string, number];
        const rows = appointments
          .filter((appointment) => appointment.dock_door_id === doorId)
          .filter((appointment) => !['cancelled', 'no_show'].includes(appointment.status))
          .filter((appointment) => overlaps(appointment.scheduled_at, appointment.duration_min, scheduledAt, durationMin))
          .map((appointment) => ({ id: appointment.id }));
        return { rows, rowCount: rows.length };
      }

      if (q.startsWith('insert into public.dock_appointments')) {
        const [doorId, carrierId, direction, reference, scheduledAt, durationMin] = params as [
          string,
          string | null,
          'inbound' | 'outbound',
          string | null,
          string,
          number,
        ];
        const row = appointmentRow({
          id: `appointment-${appointments.length + 1}`,
          dock_door_id: doorId,
          dock_door_code: doorId === DOOR_A_ID ? 'D-A' : 'D-B',
          carrier_id: carrierId,
          direction,
          reference,
          scheduled_at: scheduledAt,
          duration_min: durationMin,
          status: 'scheduled',
        });
        appointments.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (q.startsWith('select carrier_id, site_id, status from public.dock_appointments')) {
        const appointment = appointments.find((row) => row.id === params[0]);
        return {
          rows: appointment
            ? [{ carrier_id: appointment.carrier_id, site_id: appointment.site_id, status: appointment.status }]
            : [],
          rowCount: appointment ? 1 : 0,
        };
      }

      if (q.startsWith('select id from public.yard_visits') && q.includes('dock_appointment_id')) {
        const rows = visits
          .filter((visit) => visit.dock_appointment_id === params[0])
          .filter((visit) => ['arrived', 'on_site', 'completed'].includes(visit.status))
          .map((visit) => ({ id: visit.id }));
        return { rows, rowCount: rows.length };
      }

      if (q.startsWith('insert into public.yard_visits')) {
        const [siteId, appointmentId, carrierId, vehicleReg, trailerRef, driverName] = params as [
          string | null,
          string | null,
          string | null,
          string,
          string | null,
          string | null,
        ];
        const appointment = appointments.find((row) => row.id === appointmentId);
        const row = visitRow({
          id: `visit-${visits.length + 1}`,
          site_id: siteId,
          dock_appointment_id: appointmentId,
          appointment_reference: appointment?.reference ?? null,
          dock_door_code: appointment?.dock_door_code ?? null,
          carrier_id: carrierId,
          vehicle_reg: vehicleReg,
          trailer_ref: trailerRef,
          driver_name: driverName,
        });
        visits.push(row);
        return { rows: [{ id: row.id }], rowCount: 1 };
      }

      if (q.startsWith("update public.dock_appointments set status = 'arrived'")) {
        const appointment = appointments.find((row) => row.id === params[0]);
        if (appointment) appointment.status = 'arrived';
        return { rows: [], rowCount: appointment ? 1 : 0 };
      }

      if (q.startsWith('update public.yard_visits')) {
        const visit = visits.find((row) => row.id === params[0] && row.gate_out_at === null);
        if (visit) {
          visit.status = 'departed';
          visit.gate_out_at = '2026-06-24T11:25:00.000Z';
        }
        return { rows: visit ? [{ id: visit.id }] : [], rowCount: visit ? 1 : 0 };
      }

      if (q.startsWith('select id from public.yard_visits')) {
        const visit = visits.find((row) => row.id === params[0]);
        return { rows: visit ? [{ id: visit.id }] : [], rowCount: visit ? 1 : 0 };
      }

      if (q.startsWith('select yv.id')) {
        const visit = visits.find((row) => row.id === params[0]);
        return { rows: visit ? [visit] : [], rowCount: visit ? 1 : 0 };
      }

      if (q.startsWith('insert into public.weighings')) {
        weighingParams = params;
        return {
          rows: [
            {
              id: WEIGHING_ID,
              yard_visit_id: params[0],
              gross_kg: params[1],
              tare_kg: params[2],
              net_kg: params[3],
              weighed_at: '2026-06-24T12:00:00.000Z',
              weighed_by: params[4],
            },
          ],
          rowCount: 1,
        };
      }

      throw new Error(`unexpected query: ${q}`);
    }),
  };
}

beforeEach(() => {
  appointments = [appointmentRow()];
  visits = [visitRow()];
  weighingParams = null;
  client = makeClient();
});

describe('yard actions', () => {
  it('bookAppointment rejects an overlapping slot on the same door when the existing appointment is non-cancelled', async () => {
    await expect(
      bookAppointment({
        dockDoorId: DOOR_A_ID,
        carrierId: CARRIER_ID,
        direction: 'inbound',
        reference: 'REF-2',
        scheduledAt: '2026-06-24T10:30:00.000Z',
        durationMin: 30,
      }),
    ).rejects.toThrow(/overlaps/i);
  });

  it('bookAppointment accepts a slot on a different door even if times overlap', async () => {
    const result = await bookAppointment({
      dockDoorId: DOOR_B_ID,
      carrierId: CARRIER_ID,
      direction: 'inbound',
      reference: 'REF-2',
      scheduledAt: '2026-06-24T10:30:00.000Z',
      durationMin: 30,
    });

    expect(result).toMatchObject({
      dockDoorId: DOOR_B_ID,
      dockDoorCode: 'D-B',
      status: 'scheduled',
      reference: 'REF-2',
    });
  });

  it('bookAppointment accepts when the only conflicting appointment is cancelled', async () => {
    appointments = [appointmentRow({ status: 'cancelled' })];

    const result = await bookAppointment({
      dockDoorId: DOOR_A_ID,
      carrierId: CARRIER_ID,
      direction: 'outbound',
      reference: 'REF-3',
      scheduledAt: '2026-06-24T10:30:00.000Z',
      durationMin: 30,
    });

    expect(result).toMatchObject({
      dockDoorId: DOOR_A_ID,
      status: 'scheduled',
      direction: 'outbound',
      reference: 'REF-3',
    });
  });

  it('bookAppointment accepts when the only conflicting appointment is no_show', async () => {
    appointments = [appointmentRow({ status: 'no_show' })];

    const result = await bookAppointment({
      dockDoorId: DOOR_A_ID,
      carrierId: CARRIER_ID,
      direction: 'outbound',
      reference: 'REF-4',
      scheduledAt: '2026-06-24T10:30:00.000Z',
      durationMin: 30,
    });

    expect(result).toMatchObject({
      dockDoorId: DOOR_A_ID,
      status: 'scheduled',
      direction: 'outbound',
      reference: 'REF-4',
    });
    expect(appointments).toHaveLength(2);
  });

  it("gateIn creates a yard_visit with status 'on_site' and marks the appointment arrived", async () => {
    visits = [];

    const result = await gateIn({
      appointmentId: APPOINTMENT_ID,
      vehicleReg: 'WX12 ABC',
      trailerRef: 'TR-1',
      driverName: 'Dana Driver',
    });

    expect(result).toMatchObject({
      appointmentId: APPOINTMENT_ID,
      carrierId: CARRIER_ID,
      vehicleReg: 'WX12 ABC',
      trailerRef: 'TR-1',
      driverName: 'Dana Driver',
      status: 'on_site',
    });
    expect(appointments[0]?.status).toBe('arrived');
  });

  it('gateIn returns already_arrived and does not create a second visit for an already-arrived appointment', async () => {
    const result = await gateIn({
      appointmentId: APPOINTMENT_ID,
      vehicleReg: 'WX12 ABC',
    });

    expect(result).toEqual({ error: 'already_arrived' });
    expect(visits).toHaveLength(1);
  });

  it('gateIn returns appointment_cancelled and does not create a visit for a cancelled appointment', async () => {
    appointments = [appointmentRow({ status: 'cancelled' })];
    visits = [];

    const result = await gateIn({
      appointmentId: APPOINTMENT_ID,
      vehicleReg: 'WX12 ABC',
    });

    expect(result).toEqual({ error: 'appointment_cancelled' });
    expect(visits).toHaveLength(0);
  });

  it("gateOut sets gate_out_at and status 'departed'", async () => {
    const result = await gateOut(VISIT_ID);

    expect(result).toMatchObject({
      status: 'departed',
      gateOutAt: '2026-06-24T11:25:00.000Z',
    });
  });

  it('gateOut returns already_departed when called twice for the same visit', async () => {
    const first = await gateOut(VISIT_ID);
    const second = await gateOut(VISIT_ID);

    expect(first).toMatchObject({
      status: 'departed',
      gateOutAt: '2026-06-24T11:25:00.000Z',
    });
    expect(second).toEqual({ error: 'already_departed' });
  });

  it('gateOut returns not_found for an unknown visit', async () => {
    const result = await gateOut(UNKNOWN_VISIT_ID);

    expect(result).toEqual({ error: 'not_found' });
  });

  it('recordWeighing rejects invalid weights', async () => {
    await expect(
      recordWeighing({
        yardVisitId: VISIT_ID,
        grossKg: -1,
        tareKg: 0,
      }),
    ).resolves.toEqual({ error: 'invalid_weight' });
    await expect(
      recordWeighing({
        yardVisitId: VISIT_ID,
        grossKg: 10,
        tareKg: 11,
      }),
    ).resolves.toEqual({ error: 'invalid_weight' });
    await expect(
      recordWeighing({
        yardVisitId: VISIT_ID,
        grossKg: 1e21,
        tareKg: 0,
      }),
    ).resolves.toEqual({ error: 'invalid_weight' });
    expect(weighingParams).toBeNull();
  });

  it('recordWeighing computes net_kg correctly as gross minus tare', async () => {
    const result = await recordWeighing({
      yardVisitId: VISIT_ID,
      grossKg: 12_340.5,
      tareKg: 7_890.25,
    });

    expect(result).toMatchObject({
      id: WEIGHING_ID,
      yardVisitId: VISIT_ID,
      grossKg: 12_340.5,
      tareKg: 7_890.25,
      netKg: 4_450.25,
      weighedBy: USER_ID,
    });
    expect(weighingParams?.[1]).toBe('12340.5000000000');
    expect(weighingParams?.[2]).toBe('7890.2500000000');
    expect(weighingParams?.[3]).toBe('4450.250');
  });
});
