import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const migrationPaths = {
  suppliers: resolve(packageRoot, 'migrations/261-planning-suppliers.sql'),
  purchaseOrders: resolve(packageRoot, 'migrations/262-planning-purchase-orders.sql'),
  transferOrders: resolve(packageRoot, 'migrations/263-planning-transfer-orders.sql'),
};

function readMigration(path: string): string {
  expect(existsSync(path), `expected ${path}`).toBe(true);
  return readFileSync(path, 'utf8');
}

function expectOrgRls(sql: string, table: string): void {
  expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'));
  expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security`, 'i'));
  expect(sql).toMatch(new RegExp(`create\\s+policy\\s+${table}_[a-z_]+\\s+on\\s+public\\.${table}[\\s\\S]*app\\.current_org_id\\s*\\(\\s*\\)`, 'i'));
}

describe('261/262/263 planning procurement backbone migrations', () => {
  it('creates the procurement tables in FK-safe migration and DDL order', () => {
    const suppliers = readMigration(migrationPaths.suppliers);
    const purchaseOrders = readMigration(migrationPaths.purchaseOrders);
    const transferOrders = readMigration(migrationPaths.transferOrders);

    expect(suppliers).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.suppliers/i);
    expect(purchaseOrders).toMatch(/supplier_id\s+uuid\s+not\s+null\s+references\s+public\.suppliers\(id\)/i);
    expect(purchaseOrders.indexOf('create table if not exists public.purchase_orders')).toBeLessThan(
      purchaseOrders.indexOf('create table if not exists public.purchase_order_lines'),
    );
    expect(transferOrders.indexOf('create table if not exists public.transfer_orders')).toBeLessThan(
      transferOrders.indexOf('create table if not exists public.transfer_order_lines'),
    );
    expect(transferOrders).toMatch(/from_warehouse_id\s+uuid/i);
    expect(transferOrders).not.toMatch(/from_warehouse_id\s+uuid[^,]+references\s+public\.warehouses/i);
    expect(transferOrders).not.toMatch(/to_warehouse_id\s+uuid[^,]+references\s+public\.warehouses/i);
  });

  it('uses org_id RLS via app.current_org_id and no tenant GUC leakage', () => {
    const migrations = [
      readMigration(migrationPaths.suppliers),
      readMigration(migrationPaths.purchaseOrders),
      readMigration(migrationPaths.transferOrders),
    ];

    for (const sql of migrations) {
      expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
      expect(sql).not.toMatch(/^\s*tenant_id\s+uuid/im);
      expect(sql).not.toMatch(/\b(float4|float8|float|double\s+precision|real)\b/i);
    }

    expectOrgRls(migrations[0], 'suppliers');
    expectOrgRls(migrations[1], 'purchase_orders');
    expectOrgRls(migrations[1], 'purchase_order_lines');
    expectOrgRls(migrations[2], 'transfer_orders');
    expectOrgRls(migrations[2], 'transfer_order_lines');
  });

  it('targets real unique constraints for every ON CONFLICT arbiter', () => {
    const suppliers = readMigration(migrationPaths.suppliers);
    const purchaseOrders = readMigration(migrationPaths.purchaseOrders);
    const transferOrders = readMigration(migrationPaths.transferOrders);

    expect(suppliers).toMatch(/constraint\s+suppliers_org_code_unique\s+unique\s*\(\s*org_id\s*,\s*code\s*\)/i);
    expect(suppliers).toMatch(/on\s+conflict\s*\(\s*org_id\s*,\s*code\s*\)\s+do\s+update/i);

    expect(purchaseOrders).toMatch(/constraint\s+purchase_orders_org_po_number_unique\s+unique\s*\(\s*org_id\s*,\s*po_number\s*\)/i);
    expect(purchaseOrders).toMatch(/on\s+conflict\s*\(\s*org_id\s*,\s*po_number\s*\)\s+do\s+update/i);
    expect(purchaseOrders).toMatch(/constraint\s+purchase_order_lines_org_po_line_unique\s+unique\s*\(\s*org_id\s*,\s*po_id\s*,\s*line_no\s*\)/i);
    expect(purchaseOrders).toMatch(/on\s+conflict\s*\(\s*org_id\s*,\s*po_id\s*,\s*line_no\s*\)\s+do\s+update/i);

    expect(transferOrders).toMatch(/constraint\s+transfer_orders_org_to_number_unique\s+unique\s*\(\s*org_id\s*,\s*to_number\s*\)/i);
    expect(transferOrders).toMatch(/on\s+conflict\s*\(\s*org_id\s*,\s*to_number\s*\)\s+do\s+update/i);
    expect(transferOrders).toMatch(/constraint\s+transfer_order_lines_org_to_line_unique\s+unique\s*\(\s*org_id\s*,\s*to_id\s*,\s*line_no\s*\)/i);
    expect(transferOrders).toMatch(/on\s+conflict\s*\(\s*org_id\s*,\s*to_id\s*,\s*line_no\s*\)\s+do\s+update/i);
  });

  it('seeds the canonical demo org procurement backbone', () => {
    const suppliers = readMigration(migrationPaths.suppliers);
    const purchaseOrders = readMigration(migrationPaths.purchaseOrders);
    const transferOrders = readMigration(migrationPaths.transferOrders);

    expect(suppliers).toContain('00000000-0000-0000-0000-000000000002');
    expect(suppliers).toContain('SUP-DEMO-01');
    expect(suppliers).toContain('SUP-PKG-01');
    expect(suppliers).toContain('SUP-ING-01');
    expect(purchaseOrders).toContain('PO-DEMO-0001');
    expect(purchaseOrders).toContain('PO-DEMO-0002');
    expect(transferOrders).toContain('TO-DEMO-0001');
  });
});
