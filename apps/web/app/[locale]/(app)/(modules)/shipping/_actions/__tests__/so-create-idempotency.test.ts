import { describe, expect, it } from 'vitest';

import {
  buildSoCreateIdempotencyPayload,
  hashSoCreatePayload,
  soCreateIdempotencyTransactionId,
} from '../so-create-idempotency';

describe('so-create-idempotency', () => {
  it('hashes the normalized payload so identical submits collide', () => {
    const payload = buildSoCreateIdempotencyPayload({
      customer_id: '44444444-4444-4444-8444-444444444444',
      requested_date: '2026-06-20',
      notes: ' deliver am ',
      lines: [
        {
          item_id: '66666666-6666-4666-8666-666666666666',
          qty: '10.0000',
          uom: 'kg',
          unit_price_gbp: '7.2500',
          discount_pct: '12.5',
          tax_pct: '20',
          currency: 'gbp',
        },
      ],
    });

    const equivalent = buildSoCreateIdempotencyPayload({
      customer_id: '44444444-4444-4444-8444-444444444444',
      requested_date: '2026-06-20',
      notes: 'deliver am',
      lines: [
        {
          item_id: '66666666-6666-4666-8666-666666666666',
          qty: '10',
          uom: 'kg',
          unit_price_gbp: '7.2500',
          discount_pct: '12.5000',
          tax_pct: '20.0000',
          currency: 'GBP',
        },
      ],
    });

    expect(hashSoCreatePayload(payload)).toBe(hashSoCreatePayload(equivalent));
  });

  it('changes the hash when the payload changes under the same client_op_id', () => {
    const base = buildSoCreateIdempotencyPayload({
      customer_id: '44444444-4444-4444-8444-444444444444',
      lines: [{ item_id: '66666666-6666-4666-8666-666666666666', qty: '10', uom: 'kg' }],
    });
    const changed = buildSoCreateIdempotencyPayload({
      customer_id: '44444444-4444-4444-8444-444444444444',
      lines: [{ item_id: '66666666-6666-4666-8666-666666666666', qty: '11', uom: 'kg' }],
    });

    expect(hashSoCreatePayload(base)).not.toBe(hashSoCreatePayload(changed));
  });

  it('namespaces idempotency transaction ids per org so bare client_op_id cannot collide', () => {
    const clientOpId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orgA = '11111111-1111-4111-8111-111111111111';
    const orgB = '22222222-2222-4222-8222-222222222222';

    expect(soCreateIdempotencyTransactionId(orgA, clientOpId)).not.toBe(
      soCreateIdempotencyTransactionId(orgB, clientOpId),
    );
  });
});
