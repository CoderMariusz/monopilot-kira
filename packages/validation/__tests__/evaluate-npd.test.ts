import { describe, expect, it } from 'vitest';

import { evaluateNpdValidation } from '../src/evaluate-npd.js';

const ORG_ID = '00000000-0000-4000-8000-000000000028';
const TITLES: Record<string, string> = {
  V01: 'FG Code format',
  V02: 'Product Name required',
  V03: 'Pack Size in reference',
  V04: 'D365 material codes',
  V05: 'Dept required fields',
  V06: 'PR Code suffix',
  V07: 'Allergen declaration',
  V08: 'Brief mapping',
};

function ruleStatus(rules: Awaited<ReturnType<typeof evaluateNpdValidation>>, id: string) {
  return rules.find((r) => r.id === id)?.status;
}

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product_code: 'FG-016',
    product_name: 'Test Product',
    pack_size: '250g',
    ingredient_codes: '',
    status_overall: 'Complete',
    pr_code_final: 'PR-001',
    process_1: 'Mix',
    closed_technical: 'yes',
    article_number: 'ART-1',
    ...overrides,
  };
}

describe('evaluateNpdValidation', () => {
  describe('V01 product code', () => {
    it('passes when the supplied codeMaskRegExp matches the code (generic mechanism)', async () => {
      const db = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ product_code: 'FG-016' }),
        packSizes: ['250g'],
        codeMaskRegExp: /^FG-\d{3}$/,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V01')).toBe('pass');
    });

    // Documents the REAL org-0002 mask contract: org_document_settings.code_mask
    // 'FGxxxx' compiles (codeMaskToRegExp) to /^FG\d{4}$/. So the no-hyphen scheme
    // (FG0016) passes V01 and the hyphenated scheme (FG-016) does NOT — the
    // evaluator faithfully reflects the configured mask instead of the old bogus
    // ^FA (which failed every code). Whether the hyphenated codes SHOULD pass is
    // an org config decision (broaden the mask), not an evaluator bug.
    it('reflects the real FGxxxx mask: FG0016 passes, FG-016 fails', async () => {
      const db = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
      const realMask = /^FG\d{4}$/; // = codeMaskToRegExp('FGxxxx')
      const passing = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ product_code: 'FG0016' }),
        packSizes: ['250g'],
        codeMaskRegExp: realMask,
        titles: TITLES,
      });
      expect(ruleStatus(passing, 'V01')).toBe('pass');
      const failing = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ product_code: 'FG-016' }),
        packSizes: ['250g'],
        codeMaskRegExp: realMask,
        titles: TITLES,
      });
      expect(ruleStatus(failing, 'V01')).toBe('fail');
    });

    it('fails when codeMaskRegExp does not match', async () => {
      const db = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ product_code: 'BAD' }),
        packSizes: ['250g'],
        codeMaskRegExp: /^FG-\d{3}$/,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V01')).toBe('fail');
    });

    it('leniently passes when regExp is null and code is non-empty', async () => {
      const db = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ product_code: 'FG-016' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V01')).toBe('pass');
    });

    it('fails when regExp is null and code is empty', async () => {
      const db = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ product_code: '' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V01')).toBe('fail');
    });
  });

  describe('V04 D365 material', () => {
    it('maps Found to pass and never fail', async () => {
      const db = {
        async query<T>(): Promise<{ rows: T[] }> {
          return {
            rows: [{ code: 'RM123', status: 'Found', comment: 'ok' }] as T[],
          };
        },
      };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ ingredient_codes: 'RM123' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V04')).toBe('pass');
      expect(rules.some((r) => r.id === 'V04' && r.status === 'fail')).toBe(false);
    });

    it('maps Missing to warn', async () => {
      const db = {
        async query<T>(): Promise<{ rows: T[] }> {
          return {
            rows: [{ code: 'RM456', status: 'Missing', comment: 'not in D365' }] as T[],
          };
        },
      };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ ingredient_codes: 'RM456' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V04')).toBe('warn');
    });

    it('maps NoCost to warn (present in D365 but no cost)', async () => {
      const db = {
        async query<T>(): Promise<{ rows: T[] }> {
          return { rows: [{ code: 'RM789', status: 'NoCost', comment: null }] as T[] };
        },
      };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ ingredient_codes: 'RM789' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V04')).toBe('warn');
    });

    it('maps Empty to info when no codes are provided', async () => {
      const db = {
        async query<T>(): Promise<{ rows: T[] }> {
          return { rows: [] };
        },
      };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ ingredient_codes: '' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V04')).toBe('info');
    });

    it('maps Empty to info when codes are not in the D365 cache', async () => {
      const db = {
        async query<T>(): Promise<{ rows: T[] }> {
          return { rows: [] };
        },
      };
      const rules = await evaluateNpdValidation(db, {
        orgId: ORG_ID,
        productRow: baseRow({ ingredient_codes: 'RM999' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V04')).toBe('info');
      expect(rules.some((r) => r.id === 'V04' && r.status === 'fail')).toBe(false);
    });
  });

  describe('V02–V03, V05–V08', () => {
    const noopDb = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };

    it('V02 fails when product_name is empty', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ product_name: '' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V02')).toBe('fail');
    });

    it('V02 passes when product_name is present', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ product_name: 'Named' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V02')).toBe('pass');
    });

    it('V03 warns when pack_size is not in the reference list', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ pack_size: '999g' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V03')).toBe('warn');
    });

    it('V03 fails when pack_size is empty', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ pack_size: '' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V03')).toBe('fail');
    });

    it('V05 info when status_overall is not Complete/Built', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ status_overall: 'Pending' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V05')).toBe('info');
    });

    it('V05 passes when status_overall is Built', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ status_overall: 'Built' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V05')).toBe('pass');
    });

    it('V06 info when pr_code_final is missing', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ pr_code_final: '', process_1: 'Mix' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V06')).toBe('info');
    });

    it('V06 passes when pr_code_final is present and a process exists', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ pr_code_final: 'PR-001', process_1: 'Mix' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V06')).toBe('pass');
    });

    it('V07 warns when closed_technical is not yes', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ closed_technical: 'No' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V07')).toBe('warn');
    });

    it('V07 passes when closed_technical is yes (case-insensitive)', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ closed_technical: 'YES' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V07')).toBe('pass');
    });

    it('V03 passes when pack_size is in the reference list', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ pack_size: '250g' }),
        packSizes: ['250g', '500g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V03')).toBe('pass');
    });

    it('V08 info when article_number and template are absent', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ article_number: '', template: '' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V08')).toBe('info');
    });

    it('V08 passes when a template is present', async () => {
      const rules = await evaluateNpdValidation(noopDb, {
        orgId: ORG_ID,
        productRow: baseRow({ article_number: '', template: 'TMPL-1' }),
        packSizes: ['250g'],
        codeMaskRegExp: null,
        titles: TITLES,
      });
      expect(ruleStatus(rules, 'V08')).toBe('pass');
    });
  });

  it('returns all eight rules in V01–V08 order with titles', async () => {
    const db = { async query<T>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
    const rules = await evaluateNpdValidation(db, {
      orgId: ORG_ID,
      productRow: baseRow(),
      packSizes: ['250g'],
      codeMaskRegExp: null,
      titles: TITLES,
    });
    expect(rules.map((r) => r.id)).toEqual(['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08']);
    expect(rules[0]?.title).toBe('FG Code format');
  });
});
