/**
 * Lane A — 03-technical Items Master: pure zod-validation unit tests.
 *
 * These assert the action input schemas reject values that violate migration
 * 153's CHECK constraints (item_type / status / weight_mode enums, NUMERIC
 * ranges) before a row ever reaches Postgres. No DB required.
 */
import { describe, expect, it } from 'vitest';

import {
  CreateItemInput,
  DeactivateItemInput,
  ITEM_STATUSES,
  ITEM_TYPES,
  UpdateItemInput,
  WEIGHT_MODES,
} from '../_actions/shared';

describe('Items master input validation (migration 153 parity)', () => {
  const base = {
    itemCode: 'RM-1001',
    name: 'Pork shoulder',
    itemType: 'rm' as const,
    uomBase: 'kg',
  };

  it('accepts a minimal valid create payload and defaults status/weightMode', () => {
    const parsed = CreateItemInput.parse(base);
    expect(parsed.status).toBe('active');
    expect(parsed.weightMode).toBe('fixed');
  });

  it('accepts every items_item_type_check enum value', () => {
    for (const itemType of ITEM_TYPES) {
      expect(CreateItemInput.safeParse({ ...base, itemType }).success).toBe(true);
    }
  });

  it('accepts every items_status_check enum value', () => {
    for (const status of ITEM_STATUSES) {
      expect(CreateItemInput.safeParse({ ...base, status }).success).toBe(true);
    }
  });

  it('accepts every items_weight_mode_check enum value', () => {
    for (const weightMode of WEIGHT_MODES) {
      expect(CreateItemInput.safeParse({ ...base, weightMode }).success).toBe(true);
    }
  });

  it('rejects an unknown item_type (would violate items_item_type_check)', () => {
    expect(CreateItemInput.safeParse({ ...base, itemType: 'widget' }).success).toBe(false);
  });

  it('rejects an unknown status (would violate items_status_check)', () => {
    expect(CreateItemInput.safeParse({ ...base, status: 'archived' }).success).toBe(false);
  });

  it('rejects an empty item_code (NOT NULL) and an empty name', () => {
    expect(CreateItemInput.safeParse({ ...base, itemCode: '' }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('rejects an empty uom_base (NOT NULL)', () => {
    expect(CreateItemInput.safeParse({ ...base, uomBase: '' }).success).toBe(false);
  });

  it('keeps cost_per_kg as an exact decimal string for the ledger writer', () => {
    expect(CreateItemInput.safeParse({ ...base, costPerKg: -1 }).success).toBe(false);
    expect(CreateItemInput.parse({ ...base, costPerKg: '12.500000' }).costPerKg).toBe('12.500000');
    expect(CreateItemInput.parse({ ...base, costPerKg: 12.5 }).costPerKg).toBe('12.5');
  });

  it('bounds variance_tolerance_pct to [0,100] (items_variance_tolerance_pct_check)', () => {
    expect(CreateItemInput.safeParse({ ...base, varianceTolerancePct: -0.1 }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, varianceTolerancePct: 100.1 }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, varianceTolerancePct: 5 }).success).toBe(true);
  });

  it('accepts item weight columns and loose GS1 GTIN lengths', () => {
    const parsed = CreateItemInput.parse({
      ...base,
      nominalWeight: '0.2500',
      tareWeight: '0.0200',
      grossWeightMax: '0.3000',
      gs1Gtin: '01234567890123',
    });
    expect(parsed.nominalWeight).toBe(0.25);
    expect(parsed.tareWeight).toBe(0.02);
    expect(parsed.grossWeightMax).toBe(0.3);
    expect(parsed.gs1Gtin).toBe('01234567890123');

    for (const gs1Gtin of ['12345678', '123456789012', '1234567890123', '12345678901234']) {
      expect(CreateItemInput.safeParse({ ...base, gs1Gtin }).success).toBe(true);
    }
    expect(CreateItemInput.safeParse({ ...base, nominalWeight: -0.1 }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, gs1Gtin: '123456789' }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, gs1Gtin: '1234567890123A' }).success).toBe(false);
  });

  it('rejects a negative shelf_life_days (items_shelf_life_days_check)', () => {
    expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: -1 }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: 30 }).success).toBe(true);
  });

  it('rejects an item_code with illegal characters', () => {
    expect(CreateItemInput.safeParse({ ...base, itemCode: 'RM 1001' }).success).toBe(false);
    expect(CreateItemInput.safeParse({ ...base, itemCode: 'RM/1001' }).success).toBe(false);
  });

  it('UpdateItemInput requires a uuid id and a full attribute set', () => {
    expect(UpdateItemInput.safeParse({ id: 'not-a-uuid', name: 'x', itemType: 'rm', status: 'active', uomBase: 'kg', weightMode: 'fixed' }).success).toBe(false);
    expect(
      UpdateItemInput.safeParse({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Pork shoulder',
        itemType: 'rm',
        status: 'active',
        uomBase: 'kg',
        weightMode: 'fixed',
        nominalWeight: '1.5000',
        tareWeight: '0.0500',
        grossWeightMax: '1.7000',
        gs1Gtin: '1234567890123',
      }).success,
    ).toBe(true);
  });

  it('DeactivateItemInput requires a uuid id', () => {
    expect(DeactivateItemInput.safeParse({ id: 'nope' }).success).toBe(false);
    expect(DeactivateItemInput.safeParse({ id: '11111111-1111-1111-1111-111111111111' }).success).toBe(true);
  });
});
