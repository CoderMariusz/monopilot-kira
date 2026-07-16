import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration505 = resolve(packageRoot, 'migrations/505-transfer-order-line-qty-scale.sql');

describe('505 transfer_order_lines.qty scale migration (file contract)', () => {
  it('expands transfer_order_lines.qty to numeric(18,6)', () => {
    expect(existsSync(migration505)).toBe(true);
    const sql = readFileSync(migration505, 'utf8');
    expect(sql).toMatch(/alter table public\.transfer_order_lines/i);
    expect(sql).toMatch(/qty type numeric\(18,\s*6\)/i);
  });
});
