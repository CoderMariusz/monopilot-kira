import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration507 = resolve(packageRoot, 'migrations/507-purchase-order-line-tax-pct.sql');

describe('507 purchase_order_lines.tax_pct migration (file contract)', () => {
  it('adds tax_pct numeric(7,4) with 0–100 check', () => {
    expect(existsSync(migration507)).toBe(true);
    const sql = readFileSync(migration507, 'utf8');
    expect(sql).toMatch(/alter table public\.purchase_order_lines/i);
    expect(sql).toMatch(/tax_pct numeric\(7,\s*4\)/i);
    expect(sql).toMatch(/purchase_order_lines_tax_pct_check/i);
    expect(sql).toMatch(/between 0 and 100/i);
  });
});
