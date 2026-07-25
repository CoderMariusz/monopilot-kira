/**
 * PF-R04-14a — post-advance stage routing.
 *
 * A successful gate advance changes `current_stage`, and the stage IS the route
 * segment. Both advance mount points (the layout-level AdvanceGateModalHost and
 * the gate screen's own AdvanceGateModal) previously only called router.refresh(),
 * which re-rendered the stage the user had just LEFT. They now resolve the new
 * stage's URL through the single helper exercised here.
 */

import { describe, expect, it } from 'vitest';

import { pipelineStageHrefFromPathname, stageRoutePath } from '../stage-routes';

const PROJECT = '11111111-1111-4111-8111-111111111111';

describe('pipelineStageHrefFromPathname', () => {
  it('swaps the stage segment while preserving the locale prefix it was given', () => {
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/brief`, PROJECT, 'packaging')).toBe(
      `/en/pipeline/${PROJECT}/packaging`,
    );
    expect(pipelineStageHrefFromPathname(`/pl/pipeline/${PROJECT}/gate`, PROJECT, 'packaging')).toBe(
      `/pl/pipeline/${PROJECT}/packaging`,
    );
  });

  it('maps stage codes to their real route segments, not the raw code', () => {
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/brief`, PROJECT, 'recipe')).toBe(
      `/en/pipeline/${PROJECT}/formulation`,
    );
    expect(
      pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/brief`, PROJECT, 'costing_nutrition'),
    ).toBe(`/en/pipeline/${PROJECT}/costing-nutrition`);
  });

  it('works from the project index route (no stage segment yet)', () => {
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}`, PROJECT, 'brief')).toBe(
      `/en/pipeline/${PROJECT}/brief`,
    );
  });

  it('returns null for a terminal stage that has no page, so no caller navigates into a 404', () => {
    // handoff → launched is a real transition. stageRoutePath passes unknown codes
    // through, so navigating on its output alone would push /pipeline/<id>/launched.
    expect(stageRoutePath('launched')).toBe('launched');
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/handoff`, PROJECT, 'launched')).toBeNull();
  });

  it('returns null on missing / unusable inputs instead of guessing a URL', () => {
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/gate`, PROJECT, null)).toBeNull();
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/gate`, PROJECT, '')).toBeNull();
    expect(pipelineStageHrefFromPathname(null, PROJECT, 'brief')).toBeNull();
    expect(pipelineStageHrefFromPathname('/en/finance', PROJECT, 'brief')).toBeNull();
    // Right shape, different project — never redirect across projects.
    expect(
      pipelineStageHrefFromPathname('/en/pipeline/22222222-2222-4222-8222-222222222222', PROJECT, 'brief'),
    ).toBeNull();
  });

  it('is case- and whitespace-tolerant on the stage code (server payloads vary)', () => {
    expect(pipelineStageHrefFromPathname(`/en/pipeline/${PROJECT}/brief`, PROJECT, '  RECIPE ')).toBe(
      `/en/pipeline/${PROJECT}/formulation`,
    );
  });
});
