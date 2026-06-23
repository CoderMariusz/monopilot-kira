export type DockDoorDirection = 'inbound' | 'outbound' | 'both';
export type AppointmentDirection = 'inbound' | 'outbound';
export type AppointmentStatus = 'scheduled' | 'arrived' | 'completed' | 'cancelled' | 'no_show';
export type VisitStatus = 'on_site' | 'departed';

export interface DockDoorRow {
  id: string;
  siteId: string | null;
  warehouseId: string | null;
  code: string;
  name: string | null;
  direction: DockDoorDirection;
  isActive: boolean;
}

export interface UpsertDockDoorInput {
  id?: string;
  code: string;
  name?: string | null;
  direction: DockDoorDirection;
  warehouseId?: string | null;
  siteId?: string | null;
  isActive?: boolean;
}

export interface ListAppointmentsInput {
  from: string;
  to: string;
}

export interface AppointmentRow {
  id: string;
  siteId: string | null;
  dockDoorId: string;
  dockDoorCode: string | null;
  carrierId: string | null;
  carrierName: string | null;
  direction: AppointmentDirection;
  reference: string | null;
  scheduledAt: string;
  durationMin: number;
  status: AppointmentStatus;
  notes: string | null;
}

export interface BookAppointmentInput {
  dockDoorId: string;
  carrierId?: string | null;
  direction: AppointmentDirection;
  reference?: string | null;
  scheduledAt: string;
  durationMin: number;
}

export interface GateInInput {
  appointmentId?: string | null;
  carrierId?: string | null;
  vehicleReg: string;
  trailerRef?: string | null;
  driverName?: string | null;
}

export interface YardVisitRow {
  id: string;
  siteId: string | null;
  appointmentId: string | null;
  appointmentReference: string | null;
  dockDoorCode: string | null;
  carrierId: string | null;
  carrierName: string | null;
  vehicleReg: string;
  trailerRef: string | null;
  driverName: string | null;
  gateInAt: string;
  gateOutAt: string | null;
  status: VisitStatus;
}

export interface RecordWeighingInput {
  yardVisitId: string;
  grossKg: number;
  tareKg: number;
}

export interface WeighingRow {
  id: string;
  yardVisitId: string;
  grossKg: number;
  tareKg: number;
  netKg: number;
  weighedAt: string;
  weighedBy: string;
}
