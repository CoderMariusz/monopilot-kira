import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as cascadeHandlerModule from '../cascade-handler.js';
import { dispatchCascade } from '../dispatch.js';

const pool = {} as Pool;

describe('dispatchCascade', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches cascading events to runCascade with org and FG scope', async () => {
    const runCascadeSpy = vi
      .spyOn(cascadeHandlerModule, 'runCascade')
      .mockResolvedValueOnce(undefined);

    await dispatchCascade(
      {
        orgId: 'org-from-row',
        eventType: 'fg.manufacturing_operation_1.changed',
        aggregateType: 'fg',
        aggregateId: 'fg-from-row',
        payload: {
          org_id: 'org-123',
          fg_id: 'fg-456',
          operation_field_index: 1,
          operation_name: 'Mix',
        },
      },
      { pool },
    );

    expect(runCascadeSpy).toHaveBeenCalledTimes(1);
    expect(runCascadeSpy).toHaveBeenCalledWith({
      orgId: 'org-123',
      fgId: 'fg-456',
      operationFieldIndex: 1,
      operationName: 'Mix',
      pool,
      dryRun: false,
    });
  });

  it('does not invoke runCascade for non-cascading events', async () => {
    const runCascadeSpy = vi
      .spyOn(cascadeHandlerModule, 'runCascade')
      .mockResolvedValueOnce(undefined);

    await dispatchCascade(
      {
        orgId: 'org-123',
        eventType: 'audit.recorded',
        aggregateType: 'audit',
        aggregateId: 'audit-456',
        payload: {
          org_id: 'org-123',
          fg_id: 'fg-456',
          operation_name: 'Mix',
        },
      },
      { pool },
    );

    expect(runCascadeSpy).not.toHaveBeenCalled();
  });
});
