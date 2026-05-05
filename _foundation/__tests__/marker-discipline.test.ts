import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(__dirname, '../..');
const modulesPath = resolve(repoRoot, '_foundation/registry/modules.json');
const adrPath = resolve(repoRoot, '_foundation/decisions/ADR-035-marker-discipline.md');
const markerScriptPath = resolve(repoRoot, 'scripts/check-markers.mjs');

const expectedModules = [
  { id: '00', slug: 'foundation', phase: 'B.1', build_order: null, file: 'docs/prd/00-FOUNDATION-PRD.md', dependencies: [] },
  { id: '01', slug: 'npd', phase: 'B.2', build_order: 1, file: 'docs/prd/01-NPD-PRD.md', dependencies: ['00'] },
  { id: '02', slug: 'settings', phase: 'C1', build_order: 2, file: 'docs/prd/02-SETTINGS-PRD.md', dependencies: ['00', '01'] },
  { id: '03', slug: 'technical', phase: 'C1', build_order: 3, file: 'docs/prd/03-TECHNICAL-PRD.md', dependencies: ['00', '01', '02'] },
  { id: '04', slug: 'planning-basic', phase: 'C2', build_order: 4, file: 'docs/prd/04-PLANNING-BASIC-PRD.md', dependencies: ['01', '02', '03'] },
  { id: '05', slug: 'warehouse', phase: 'C2', build_order: 5, file: 'docs/prd/05-WAREHOUSE-PRD.md', dependencies: ['01', '02', '03'] },
  { id: '06', slug: 'scanner-p1', phase: 'C2', build_order: 6, file: 'docs/prd/06-SCANNER-P1-PRD.md', dependencies: ['05', '04'] },
  { id: '07', slug: 'planning-ext', phase: 'C3', build_order: 7, file: 'docs/prd/07-PLANNING-EXT-PRD.md', dependencies: ['04', '05'] },
  { id: '08', slug: 'production', phase: 'C3', build_order: 8, file: 'docs/prd/08-PRODUCTION-PRD.md', dependencies: ['01', '04', '05'] },
  { id: '09', slug: 'quality', phase: 'C4', build_order: 9, file: 'docs/prd/09-QUALITY-PRD.md', dependencies: ['05', '08'] },
  { id: '10', slug: 'finance', phase: 'C4', build_order: 10, file: 'docs/prd/10-FINANCE-PRD.md', dependencies: ['08', '05'] },
  { id: '11', slug: 'shipping', phase: 'C4', build_order: 11, file: 'docs/prd/11-SHIPPING-PRD.md', dependencies: ['05', '09'] },
  { id: '12', slug: 'reporting', phase: 'C5', build_order: 12, file: 'docs/prd/12-REPORTING-PRD.md', dependencies: ['08', '05', '09'] },
  { id: '13', slug: 'maintenance', phase: 'C5', build_order: 13, file: 'docs/prd/13-MAINTENANCE-PRD.md', dependencies: ['02', '08', '15'] },
  { id: '14', slug: 'multi-site', phase: 'C5', build_order: 14, file: 'docs/prd/14-MULTI-SITE-PRD.md', dependencies: ['02', '05'] },
  { id: '15', slug: 'oee', phase: 'C5', build_order: 15, file: 'docs/prd/15-OEE-PRD.md', dependencies: ['08'] },
];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runMarkerScript(args: string[]) {
  return spawnSync(process.execPath, [markerScriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

describe('TASK-000209 marker discipline ADR and module registry contract', () => {
  it('seeds modules.json with exactly the PRD §4.3 module map and org_id business scope', () => {
    expect(existsSync(modulesPath), 'expected _foundation/registry/modules.json to exist').toBe(true);

    const registry = readJson(modulesPath);
    expect(Array.isArray(registry)).toBe(true);
    expect(registry).toHaveLength(16);
    expect(registry).toEqual(
      expectedModules.map((entry) => ({
        ...entry,
        business_scope_column: 'org_id',
      })),
    );
  });

  it('documents marker discipline and Wave0 domain naming rules in ADR-035', () => {
    expect(existsSync(adrPath), 'expected _foundation/decisions/ADR-035-marker-discipline.md to exist').toBe(true);

    const adr = readFileSync(adrPath, 'utf8');
    for (const marker of ['[UNIVERSAL]', '[APEX-CONFIG]', '[EVOLVING]', '[LEGACY-D365]']) {
      expect(adr).toContain(marker);
    }

    expect(adr).toMatch(/business[- ]domain docs\/tasks[^\n]+org_id/i);
    expect(adr).toMatch(/\borg_id\b/);
    expect(adr).toMatch(/\bfg\.\*/);
    expect(adr).toMatch(/\bfa\.\*\b|\bFA\b/i);
    expect(adr).toMatch(/legacy compatibility alias|legacy alias|compatibility alias/i);
    expect(adr).toContain('_foundation/glossary/domain-terms.md');
    expect(adr).toMatch(/ACP-ready|ACP task/i);
  });

  it('provides a marker checker CLI that rejects unmarked PRD/ADR headings and accepts ADR-035', () => {
    expect(existsSync(markerScriptPath), 'expected scripts/check-markers.mjs to exist').toBe(true);

    const fixtureDir = mkdtempSync(join(tmpdir(), 'monopilot-marker-fixture-'));
    const unmarked = join(fixtureDir, 'UNMARKED-PRD.md');
    writeFileSync(
      unmarked,
      ['# Fixture PRD', '', '## Executive Summary', '', '### A business heading without marker', 'Body.'].join('\n'),
    );

    const bad = runMarkerScript([unmarked]);
    expect(bad.status).not.toBe(0);
    expect(`${bad.stdout}\n${bad.stderr}`).toMatch(/A business heading without marker|missing marker|unmarked/i);

    const good = runMarkerScript([adrPath]);
    expect(good.status).toBe(0);
  });
});
