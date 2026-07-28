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
import { parseItemsCsv } from '../../../../../../../lib/import/parse-items-csv';

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
    // R03-02 — 'catch' additionally requires its measurable envelope, so feed it
    // one here; the enum itself is what this case is about.
    const catchFields = { nominalWeight: '0.2500', grossWeightMax: '0.3000', varianceTolerancePct: 5 };
    for (const weightMode of WEIGHT_MODES) {
      const payload = weightMode === 'catch' ? { ...base, weightMode, ...catchFields } : { ...base, weightMode };
      expect(CreateItemInput.safeParse(payload).success, weightMode).toBe(true);
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
    // Exact decimal strings — bound ::numeric, never round-tripped through a float.
    expect(parsed.nominalWeight).toBe('0.2500');
    expect(parsed.tareWeight).toBe('0.0200');
    expect(parsed.grossWeightMax).toBe('0.3000');
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
    // R03-03 — days now travel WITH a mode; days alone is an incomplete rule.
    expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: 30, shelfLifeMode: 'use_by' }).success).toBe(true);
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

/**
 * FALA 5 / T1 — cross-field invariants (R03-01 / R03-02 / R03-03).
 *
 * These live on the ONE `.superRefine(refineItemInvariants)` seam shared by
 * CreateItemInput and UpdateItemInput, so every case below holds for the create
 * wizard, the edit wizard AND the CSV bulk import (commit-import.ts commits by
 * calling createItem / updateItem, which re-parse through these same schemas).
 */
describe('Item master cross-field invariants (FALA 5 / T1)', () => {
  const base = {
    itemCode: 'RM-1001',
    name: 'Pork shoulder',
    itemType: 'rm' as const,
    uomBase: 'kg',
  };
  const updateBase = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Pork shoulder',
    itemType: 'rm' as const,
    status: 'active' as const,
    uomBase: 'kg',
    weightMode: 'fixed' as const,
  };
  /**
   * Field paths carried by the rejection — proves each error is ATTACHED to its
   * field (so the form can render it inline) rather than being a form-level blob.
   */
  const pathsOf = (result: {
    success: boolean;
    error?: { issues: Array<{ path: Array<string | number> }> };
  }): string[] => (result.success || !result.error ? [] : result.error.issues.map((i) => i.path.join('.')));

  // ── R03-01 — identical base / secondary UoM ────────────────────────────────
  it('rejects uom_secondary equal to uom_base, with the error ON the uomSecondary field', () => {
    const result = CreateItemInput.safeParse({ ...base, uomBase: 'g', uomSecondary: 'g' });
    expect(result.success).toBe(false);
    // Exactly one issue, and it hangs off uomSecondary — not a form-level error.
    expect(pathsOf(result)).toEqual(['uomSecondary']);
  });

  it('rejects identical units on UPDATE too (the audit reproduced this via edit)', () => {
    const result = UpdateItemInput.safeParse({ ...updateBase, uomBase: 'g', uomSecondary: 'g' });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('uomSecondary');
  });

  it('ANTI-REGRESSION: an empty / omitted secondary UoM stays legal', () => {
    expect(CreateItemInput.safeParse({ ...base, uomSecondary: '' }).success).toBe(true);
    expect(CreateItemInput.safeParse({ ...base }).success).toBe(true);
    expect(CreateItemInput.safeParse({ ...base, uomBase: 'kg', uomSecondary: 'g' }).success).toBe(true);
  });

  it('catches the legacy szt/ea alias collapsing onto the same canonical pcs', () => {
    // Both normalize to `pcs`, so they are the SAME unit spelled two ways.
    expect(CreateItemInput.safeParse({ ...base, uomBase: 'pcs', uomSecondary: 'szt' }).success).toBe(false);
  });

  // ── R03-02 — catch weight must be measurable ───────────────────────────────
  const catchComplete = {
    weightMode: 'catch' as const,
    nominalWeight: '0.2500',
    grossWeightMax: '0.3000',
    varianceTolerancePct: 5,
  };

  it('rejects a catch-weight item with every weight field empty (the audit payload)', () => {
    const result = CreateItemInput.safeParse({ ...base, weightMode: 'catch' });
    expect(result.success).toBe(false);
    const paths = pathsOf(result);
    expect(paths).toContain('nominalWeight');
    expect(paths).toContain('grossWeightMax');
    expect(paths).toContain('varianceTolerancePct');
  });

  it('rejects catch weight missing ONLY grossWeightMax', () => {
    const result = CreateItemInput.safeParse({
      ...base,
      weightMode: 'catch',
      nominalWeight: '0.2500',
      varianceTolerancePct: 5,
    });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('grossWeightMax');
  });

  it('rejects a zero nominal weight — that is exactly the value the variance gate degrades to', () => {
    const result = CreateItemInput.safeParse({ ...base, ...catchComplete, nominalWeight: 0 });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('nominalWeight');
  });

  it('accepts a COMPLETE catch-weight item', () => {
    expect(CreateItemInput.safeParse({ ...base, ...catchComplete }).success).toBe(true);
    expect(UpdateItemInput.safeParse({ ...updateBase, ...catchComplete }).success).toBe(true);
  });

  it('rejects gross_weight_max below nominal_weight (transposed pair)', () => {
    const result = CreateItemInput.safeParse({
      ...base,
      ...catchComplete,
      nominalWeight: '0.5000',
      grossWeightMax: '0.3000',
    });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('grossWeightMax');
  });

  it('allows gross_weight_max EQUAL to nominal_weight, and a 0 % zero-tolerance policy', () => {
    expect(
      CreateItemInput.safeParse({
        ...base,
        ...catchComplete,
        nominalWeight: '0.3000',
        grossWeightMax: '0.3000',
        varianceTolerancePct: 0,
      }).success,
    ).toBe(true);
  });

  // ── A-1 — the rule may not be satisfiable by a value the COLUMN cannot hold ──
  // nominal_weight / gross_weight_max are numeric(10,4). Held as `number` and
  // checked with `> 0`, this payload passed validation and Postgres then stored
  // BOTH weights as 0.0000 — re-creating the zero reference R03-02 exists to
  // prevent. The decimal-places cap makes "below the column scale" unreachable.
  it('rejects a catch envelope BELOW the column scale (0.00001 would persist as 0.0000)', () => {
    const result = CreateItemInput.safeParse({
      ...base,
      weightMode: 'catch',
      nominalWeight: '0.00001',
      grossWeightMax: '0.00001',
      varianceTolerancePct: 5,
    });
    expect(result.success).toBe(false);
    const paths = pathsOf(result);
    expect(paths).toContain('nominalWeight');
    expect(paths).toContain('grossWeightMax');
    // A NAMED error, not a bare "invalid" — it says why 5 dp cannot be stored.
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toContain(
      'weight supports at most 4 decimal places (numeric(10,4)) — a smaller value persists as 0',
    );
  });

  it('rejects sub-scale weights sent as JS numbers too (the client used to coerce)', () => {
    expect(
      CreateItemInput.safeParse({ ...base, ...catchComplete, nominalWeight: 0.00001 }).success,
    ).toBe(false);
    // …and on UPDATE, which is the path the CSV import commits through.
    expect(
      UpdateItemInput.safeParse({ ...updateBase, ...catchComplete, grossWeightMax: 0.00001 }).success,
    ).toBe(false);
  });

  it('accepts exactly 4 decimal places — the smallest value the column can hold', () => {
    expect(
      CreateItemInput.safeParse({
        ...base,
        weightMode: 'catch',
        nominalWeight: '0.0001',
        grossWeightMax: '0.0001',
        varianceTolerancePct: 0,
      }).success,
    ).toBe(true);
  });

  // ── A-4 — an empty tolerance box is not a deliberate 0 % policy ──────────────
  it('rejects an EMPTY variance tolerance on a catch item (z.coerce turned it into 0)', () => {
    const result = CreateItemInput.safeParse({ ...base, ...catchComplete, varianceTolerancePct: '' });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('varianceTolerancePct');
  });

  it('ANTI-REGRESSION: an EXPLICIT 0 % tolerance is still a legal policy', () => {
    expect(CreateItemInput.safeParse({ ...base, ...catchComplete, varianceTolerancePct: 0 }).success).toBe(true);
    expect(CreateItemInput.safeParse({ ...base, ...catchComplete, varianceTolerancePct: '0' }).success).toBe(true);
    expect(UpdateItemInput.safeParse({ ...updateBase, ...catchComplete, varianceTolerancePct: 0 }).success).toBe(true);
  });

  it('an EMPTY shelf-life day count does not switch shelf life on', () => {
    // '' used to coerce to 0, which R03-03 then rejected as "0 days".
    expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: '' }).success).toBe(true);
  });

  it('ANTI-REGRESSION: weight_mode "fixed" needs NO weight fields at all', () => {
    // The overwhelming majority of items are fixed-weight with empty weights —
    // tightening this would block the whole master.
    expect(CreateItemInput.safeParse({ ...base, weightMode: 'fixed' }).success).toBe(true);
    expect(CreateItemInput.safeParse({ ...base }).success).toBe(true);
    expect(UpdateItemInput.safeParse({ ...updateBase }).success).toBe(true);
    // ...and tare stays optional even for catch weight.
    expect(CreateItemInput.safeParse({ ...base, ...catchComplete, tareWeight: undefined }).success).toBe(true);
  });

  // ── R03-03 — shelf life on ⇒ positive days + a mode ────────────────────────
  it('rejects shelf life switched on with 0 days (the audit payload)', () => {
    const result = CreateItemInput.safeParse({ ...base, shelfLifeDays: 0 });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('shelfLifeDays');
  });

  it('rejects 0 days even when a mode IS supplied', () => {
    const result = CreateItemInput.safeParse({ ...base, shelfLifeDays: 0, shelfLifeMode: 'use_by' });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('shelfLifeDays');
  });

  it('rejects days without a mode, and a mode without days — errors ON the missing field', () => {
    const noMode = CreateItemInput.safeParse({ ...base, shelfLifeDays: 19 });
    expect(noMode.success).toBe(false);
    expect(pathsOf(noMode)).toContain('shelfLifeMode');

    const noDays = CreateItemInput.safeParse({ ...base, shelfLifeMode: 'best_before' });
    expect(noDays.success).toBe(false);
    expect(pathsOf(noDays)).toContain('shelfLifeDays');
  });

  it('accepts 19 days + best_before', () => {
    expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: 19, shelfLifeMode: 'best_before' }).success).toBe(
      true,
    );
    expect(
      UpdateItemInput.safeParse({ ...updateBase, shelfLifeDays: 19, shelfLifeMode: 'best_before' }).success,
    ).toBe(true);
  });

  it('ANTI-REGRESSION: shelf life switched OFF passes with neither days nor mode', () => {
    expect(CreateItemInput.safeParse({ ...base }).success).toBe(true);
    expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: undefined, shelfLifeMode: undefined }).success).toBe(
      true,
    );
    expect(UpdateItemInput.safeParse({ ...updateBase }).success).toBe(true);
  });

  // ── The seam really is shared: the CSV import rides the same rule ──────────
  it('CSV bulk import hits the SAME rule — no second validation path to keep in sync', () => {
    // commit-import.ts commits a `create` row by calling createItem with exactly
    // these parsed fields, and createItem re-parses through CreateItemInput. So
    // feeding the REAL parser's output to the schema reproduces the import path.
    const csv = ['item_code,name,item_type,uom_base,uom_secondary', 'RM-CSV-1,Imported salt,rm,g,g'].join('\n');
    const parsed = parseItemsCsv('rm', csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const row = parsed.rows[0]!;
    expect(row.uomBase).toBe('g');
    expect(row.uomSecondary).toBe('g');

    const result = CreateItemInput.safeParse({
      itemCode: row.itemCode,
      name: row.name,
      itemType: row.itemType,
      uomBase: row.uomBase,
      status: row.status,
      weightMode: row.weightMode,
      description: row.description,
      productGroup: row.productGroup,
      uomSecondary: row.uomSecondary,
      costPerKg: row.costPerKg,
    });
    expect(result.success).toBe(false);
    expect(pathsOf(result)).toContain('uomSecondary');
  });

  it('CSV import still accepts a clean row (anti-regression on the import path)', () => {
    const csv = ['item_code,name,item_type,uom_base,uom_secondary', 'RM-CSV-2,Imported salt,rm,kg,g'].join('\n');
    const parsed = parseItemsCsv('rm', csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const row = parsed.rows[0]!;
    expect(
      CreateItemInput.safeParse({
        itemCode: row.itemCode,
        name: row.name,
        itemType: row.itemType,
        uomBase: row.uomBase,
        uomSecondary: row.uomSecondary,
        weightMode: row.weightMode,
      }).success,
    ).toBe(true);
  });

  it('matches the stricter rule the shelf-life OVERRIDE screen already enforced', () => {
    // technical/shelf-life/_actions/shared.ts ShelfLifeOverrideInput has always
    // used int().positive() + a REQUIRED mode. The item master was the outlier;
    // the two screens can no longer disagree about the same two columns.
    for (const days of [0, -1]) {
      expect(CreateItemInput.safeParse({ ...base, shelfLifeDays: days, shelfLifeMode: 'use_by' }).success).toBe(
        false,
      );
    }
  });
});
