import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DuplicateDomainError,
  getRegisteredHandlers,
  registerErasureHandler,
} from '../registry';
import type { ErasureHandler } from '../types';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');
const contractPath = resolve(repoRoot, '_foundation/contracts/gdpr.md');

const noopHandler: ErasureHandler = async (ctx) => ({
  domain: `test.${ctx.subjectId}`,
  rowsAffected: 0,
  tablesTouched: [],
  warnings: [],
});

describe('erasure handler registry', () => {
  it('throws DuplicateDomainError containing the domain when registered twice without force', () => {
    registerErasureHandler('registry.duplicate', noopHandler);

    expect(() => registerErasureHandler('registry.duplicate', noopHandler)).toThrow(
      DuplicateDomainError,
    );
    expect(() => registerErasureHandler('registry.duplicate', noopHandler)).toThrow(
      /registry\.duplicate/,
    );
  });

  it('preserves registration order and allows intentional replacement with force', () => {
    const first: ErasureHandler = async () => ({
      domain: 'registry.order.first',
      rowsAffected: 0,
      tablesTouched: [],
      warnings: [],
    });
    const second: ErasureHandler = async () => ({
      domain: 'registry.order.second',
      rowsAffected: 0,
      tablesTouched: [],
      warnings: [],
    });

    registerErasureHandler('registry.order.first', first);
    registerErasureHandler('registry.order.second', second);
    registerErasureHandler('registry.order.first', second, { force: true });

    const entries = Array.from(getRegisteredHandlers().entries()).filter(([domain]) =>
      domain.startsWith('registry.order.'),
    );

    expect(entries.map(([domain]) => domain)).toEqual([
      'registry.order.first',
      'registry.order.second',
    ]);
    expect(entries[0]?.[1]).toBe(second);
  });

  it('documents the normative GDPR erasure contract', () => {
    const contract = readFileSync(contractPath, 'utf-8');

    expect(contract).toContain('Per-domain handler protocol');
    expect(contract).toContain('tx-scoped contract');
    expect(contract).toContain('gdpr.erasure.completed');
    expect(contract).toContain('gdpr.erasure.failed');
    expect(contract).toContain('gdpr.erasure.dry_run');
    expect(contract).toContain('Sibling implementations');
    expect(contract).toContain('Normative scope');
    expect(contract).toContain('Warehouse signed_by');
    expect(contract).toContain('Scanner operator_id');
    expect(contract).toContain('Quality e-sign signers');
    expect(contract).toContain('Production WO actor cols');
  });
});
