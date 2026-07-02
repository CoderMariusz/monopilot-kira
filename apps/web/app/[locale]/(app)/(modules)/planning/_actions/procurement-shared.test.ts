import { describe, expect, it } from 'vitest';

import { TransferOrderStatusSchema } from './procurement-shared';

describe('TransferOrderStatusSchema', () => {
  it('accepts partially_received transfer orders from the live DB state', () => {
    expect(TransferOrderStatusSchema.parse('partially_received')).toBe('partially_received');
  });
});
