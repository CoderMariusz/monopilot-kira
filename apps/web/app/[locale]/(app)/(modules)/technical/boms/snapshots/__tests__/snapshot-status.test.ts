import { describe, expect, it } from 'vitest';

import {
  deriveSnapshotStatus,
  mapSnapshotRow,
  SNAPSHOT_OPEN_WO_STATUSES,
  SNAPSHOT_TERMINAL_WO_STATUSES,
  type SnapshotQueryRow,
} from '../_actions/shared';

function row(overrides: Partial<SnapshotQueryRow>): SnapshotQueryRow {
  return {
    id: 'snap-1',
    work_order_id: 'wo-1',
    wo_number: 'WO-001',
    bom_header_id: 'hdr-1',
    bom_version: 3,
    product_id: 'FG-001',
    product_name: 'Test FG',
    line_count: 2,
    snapshot_at: '2026-07-27T00:00:00.000Z',
    header_exists: true,
    wo_status: 'DRAFT',
    ...overrides,
  };
}

describe('deriveSnapshotStatus (PF-R06-11 FIX-T5)', () => {
  it('marks both open DRAFT WOs on the same BOM header as in_use', () => {
    const older = deriveSnapshotStatus(row({ id: 'snap-old', wo_status: 'DRAFT' }));
    const newer = deriveSnapshotStatus(row({ id: 'snap-new', wo_status: 'DRAFT' }));
    expect(older).toBe('in_use');
    expect(newer).toBe('in_use');
  });

  it('classifies terminal WO states as closed', () => {
    for (const status of SNAPSHOT_TERMINAL_WO_STATUSES) {
      expect(deriveSnapshotStatus(row({ wo_status: status }))).toBe('closed');
    }
  });

  it('classifies open WO states as in_use', () => {
    for (const status of SNAPSHOT_OPEN_WO_STATUSES) {
      expect(deriveSnapshotStatus(row({ wo_status: status }))).toBe('in_use');
    }
  });

  it('returns orphaned when the canonical header or WO link is missing', () => {
    expect(deriveSnapshotStatus(row({ header_exists: false }))).toBe('orphaned');
    expect(deriveSnapshotStatus(row({ wo_status: null }))).toBe('orphaned');
  });

  it('maps query rows through deriveSnapshotStatus', () => {
    expect(mapSnapshotRow(row({ wo_status: 'RELEASED' })).status).toBe('in_use');
    expect(mapSnapshotRow(row({ wo_status: 'CLOSED' })).status).toBe('closed');
  });
});
