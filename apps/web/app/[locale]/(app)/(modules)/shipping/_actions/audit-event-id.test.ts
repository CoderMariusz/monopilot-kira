import { describe, expect, it } from 'vitest';

import { toAuditEventId } from './audit-event-id';

describe('toAuditEventId', () => {
  it('accepts bigint-as-string from node-postgres', () => {
    expect(toAuditEventId('9007199254740')).toBe(9007199254740);
    expect(toAuditEventId('1')).toBe(1);
    expect(toAuditEventId(9001)).toBe(9001);
  });

  it('still rejects a missing/garbage audit row', () => {
    for (const bad of [undefined, null, '', '   ', 'abc', '1.5', '-3', '0', '0', NaN, {}, []]) {
      expect(toAuditEventId(bad)).toBeNull();
    }
  });
});
