import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ACTION_DIR = resolve(__dirname);

type ActionFile = 'ip-allowlist-add.ts' | 'ip-allowlist-remove.ts' | 'ip-allowlist-list.ts';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readActionSource(fileName: ActionFile): string {
  const path = resolve(ACTION_DIR, fileName);
  expect(existsSync(path), `${fileName} must exist as a Server Action module for TASK-000089/T-036 IP allowlist CRUD`).toBe(true);
  return stripComments(readFileSync(path, 'utf8'));
}

function normalize(source: string): string {
  return source.replace(/\s+/g, ' ').toLowerCase();
}

function indexOfAny(source: string, fragments: readonly string[]): number {
  const indexes = fragments.map((fragment) => source.indexOf(fragment.toLowerCase())).filter((index) => index >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

function expectServerActionWithEditRbac(source: string, actionName: string): number {
  expect(source).toContain("'use server'");
  expect(source).toMatch(new RegExp(`export\\s+async\\s+function\\s+${actionName}\\s*\\(`, 'i'));
  expect(source).toMatch(/withorgcontext\s*\(/);

  const permissionIndex = source.indexOf('settings.ip_allowlist.edit');
  const forbiddenIndex = indexOfAny(source, ['forbidden', 'FORBIDDEN']);
  expect(permissionIndex, `${actionName} must require settings.ip_allowlist.edit`).toBeGreaterThanOrEqual(0);
  expect(forbiddenIndex, `${actionName} must raise FORBIDDEN for callers lacking settings.ip_allowlist.edit`).toBeGreaterThan(permissionIndex);
  return permissionIndex;
}

describe('admin IP allowlist Server Actions (TASK-000089/T-036 RED)', () => {
  it('addIpRange rejects 0.0.0.0/0 with CIDR_OVERLAP_DEFAULT before any persistence', () => {
    const source = normalize(readActionSource('ip-allowlist-add.ts'));
    const guardIndex = expectServerActionWithEditRbac(source, 'addIpRange');

    expect(source, 'CIDR parsing/comparison must use ipaddr.js per task contract').toContain('ipaddr.js');
    expect(source).toMatch(/cidr/);

    const defaultCidrIndex = source.indexOf('0.0.0.0/0');
    const overlapErrorIndex = source.indexOf('cidr_overlap_default');
    const persistenceIndex = indexOfAny(source, [
      'insert into public.admin_ip_allowlist',
      'admin_ip_allowlist',
      '.insert(',
      'values(',
    ]);

    expect(defaultCidrIndex, 'addIpRange must explicitly detect the default-open CIDR 0.0.0.0/0').toBeGreaterThan(guardIndex);
    expect(overlapErrorIndex, 'addIpRange must raise CIDR_OVERLAP_DEFAULT for 0.0.0.0/0').toBeGreaterThan(defaultCidrIndex);
    expect(persistenceIndex, 'CIDR_OVERLAP_DEFAULT must be raised before admin_ip_allowlist persistence').toBeGreaterThan(overlapErrorIndex);
  });

  it('addIpRange persists a valid /32 and emits settings.ip_allowlist.changed in the outbox', () => {
    const source = normalize(readActionSource('ip-allowlist-add.ts'));
    const guardIndex = expectServerActionWithEditRbac(source, 'addIpRange');

    expect(source).toMatch(/\/32|parsecidr|parse\s*\(/);
    const persistenceIndex = indexOfAny(source, [
      'insert into public.admin_ip_allowlist',
      '.insert(',
      'admin_ip_allowlist',
    ]);
    const outboxIndex = indexOfAny(source, ['enqueueoutbox', 'outbox_events', 'insert into public.outbox']);
    const eventIndex = source.indexOf('settings.ip_allowlist.changed');

    expect(persistenceIndex, 'addIpRange must write a valid CIDR row after RBAC').toBeGreaterThan(guardIndex);
    expect(outboxIndex, 'addIpRange must enqueue an outbox event after the row write').toBeGreaterThan(persistenceIndex);
    expect(eventIndex, 'addIpRange must emit settings.ip_allowlist.changed for audit alignment').toBeGreaterThan(outboxIndex);
  });

  it('removeIpRange and listIpRanges both enforce settings.ip_allowlist.edit and FORBIDDEN', () => {
    const removeSource = normalize(readActionSource('ip-allowlist-remove.ts'));
    const listSource = normalize(readActionSource('ip-allowlist-list.ts'));

    const removeGuardIndex = expectServerActionWithEditRbac(removeSource, 'removeIpRange');
    expect(indexOfAny(removeSource, ['delete from public.admin_ip_allowlist', '.delete(', 'admin_ip_allowlist'])).toBeGreaterThan(removeGuardIndex);

    const listGuardIndex = expectServerActionWithEditRbac(listSource, 'listIpRanges');
    expect(indexOfAny(listSource, ['select', '.select(', 'admin_ip_allowlist'])).toBeGreaterThan(listGuardIndex);
  });
});
