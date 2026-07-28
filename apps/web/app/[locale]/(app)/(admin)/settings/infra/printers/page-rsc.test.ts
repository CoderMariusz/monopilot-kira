import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGE = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/printers/page.tsx');

describe('settings printers page — RSC boundary', () => {
  const source = readFileSync(PAGE, 'utf8');

  it('deletePrinterAction is a use-server adapter mapping printerId to removePrinter({ id })', () => {
    expect(source).toContain("'use server'");
    expect(source).toMatch(/async function deletePrinterAction\(printerId: string\)/);
    expect(source).toMatch(/return removePrinter\(\{ id: printerId \}\)/);
  });

  it('passes deletePrinter as a named server action reference, not an inline closure', () => {
    expect(source).toContain('async function deletePrinterAction(printerId: string)');
    expect(source).toMatch(/deletePrinter=\{props\.deletePrinter \?\? deletePrinterAction\}/);
    expect(source).not.toMatch(/deletePrinter=\{props\.deletePrinter \?\? \(\(/);
  });

  it('passes upsertPrinter by module action reference without wrapping closure', () => {
    expect(source).toMatch(/upsertPrinter=\{props\.upsertPrinter \?\? persistPrinter\}/);
    expect(source).not.toMatch(/upsertPrinter=\{props\.upsertPrinter \?\? \(/);
  });

  it('threads only serializable data props into PrintersScreen', () => {
    const screenProps = source.match(/<PrintersScreen[\s\S]*?\/>/s)?.[0] ?? '';

    expect(screenProps).toContain('initialPrinters={loaded.printers}');
    expect(screenProps).toContain('sites={loaded.sites}');
    expect(screenProps).toContain('labels={labels}');
    expect(screenProps).toContain('canManage={props.canManage ?? loaded.canManage}');
    expect(screenProps).toContain('state={props.state ?? loaded.state}');
    expect(screenProps).not.toMatch(/labels=\{[^}]*=>/);
    expect(screenProps).not.toMatch(/sites=\{[^}]*=>/);
  });
});
