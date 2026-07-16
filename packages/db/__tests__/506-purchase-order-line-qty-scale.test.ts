import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration506 = resolve(packageRoot, 'migrations/506-purchase-order-line-qty-scale.sql');

describe('506 purchase_order_lines.qty scale migration (file contract)', () => {
  it('expands purchase_order_lines.qty to numeric(18,6)', () => {
    expect(existsSync(migration506)).toBe(true);
    const sql = readFileSync(migration506, 'utf8');
    expect(sql).toMatch(/alter table public\.purchase_order_lines/i);
    expect(sql).toMatch(/qty type numeric\(18,\s*6\)/i);
  });
});
