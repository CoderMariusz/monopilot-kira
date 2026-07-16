import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveAdvanceTransition,
  resolveGateReadiness,
} from '../../../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx',
);
const ACTION = join(
  process.cwd(),
  'app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/_actions/toggle-gate-checklist.ts',
);

describe('NPD gate page — RSC boundary', () => {
  it('approvalHistory subtitle passes ICU {count} from loaded approvals', () => {
    const pageSource = readFileSync(PAGE, 'utf8');

    expect(pageSource).toMatch(/t\('subtitle',\s*\{\s*count\s*\}\)/);
    expect(pageSource).toContain('const approvalCount = loaded.data?.approvals.length ?? 0');
    expect(pageSource).toContain('loadHistoryLabels(locale, approvalCount)');
    expect(pageSource).not.toMatch(/loadHistoryLabels\(locale,\s*'npd\.approvalHistory'\)/);
  });

  it('toggleGateChecklistItem uses a module server action (no inline adapter)', () => {
    const pageSource = readFileSync(PAGE, 'utf8');
    const actionSource = readFileSync(ACTION, 'utf8');

    expect(pageSource).not.toMatch(/toggleChecklistAdapter\.bind\(/);
    expect(pageSource).not.toMatch(/async function toggleChecklistAdapter/);
    expect(pageSource).toContain("import { toggleGateChecklistAdapter } from './_actions/toggle-gate-checklist'");
    expect(pageSource).toContain('toggleGateChecklistItem={loaded.canWrite ? toggleGateChecklistAdapter : undefined}');

    expect(actionSource).toContain("'use server'");
    expect(actionSource).toMatch(/export async function toggleGateChecklistAdapter/);
    expect(actionSource).not.toMatch(/export type /);
    expect(actionSource).not.toMatch(/export const /);
  });

  it('advance modal and adapter share resolveGateReadiness sequence (G0→G1→G2)', () => {
    const pageSource = readFileSync(PAGE, 'utf8');

    expect(pageSource).toContain('resolveGateReadiness');
    expect(pageSource).toContain('resolveAdvanceTransition');
    expect(pageSource).not.toContain('nextGate(');

    const g0 = resolveGateReadiness({ current_gate: 'G0', current_stage: 'brief' });
    expect(g0.checklistGate).toBe('G0');
    expect(g0.advance?.targetGate).toBe('G1');

    const g1 = resolveGateReadiness({ current_gate: 'G1', current_stage: 'brief' });
    expect(g1.checklistGate).toBe('G1');
    expect(g1.advance?.targetGate).toBe('G2');

    const g2 = resolveGateReadiness({ current_gate: 'G2', current_stage: 'recipe' });
    expect(g2.checklistGate).toBe('G2');
    expect(g2.advance?.targetGate).toBe('G3');

    expect(resolveAdvanceTransition({ current_gate: 'G0', current_stage: 'brief' })).toEqual({
      kind: 'gate',
      nextStage: 'brief',
      targetGate: 'G1',
      requiresESign: false,
    });
  });
});
