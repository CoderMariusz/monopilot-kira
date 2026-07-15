import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/494-so-line-discount-tax-currency.sql'),
  'utf8',
);

describe('migration 494', () => {
  it('adds nullable line currency and zero-default discount/tax idempotently', () => {
    expect(sql).toMatch(/add column if not exists discount_pct numeric\(7, 4\) default 0/i);
    expect(sql).toMatch(/add column if not exists tax_pct numeric\(7, 4\) default 0/i);
    expect(sql).toMatch(/add column if not exists currency text/i);
    expect(sql).not.toMatch(/currency text not null/i);
  });
});
