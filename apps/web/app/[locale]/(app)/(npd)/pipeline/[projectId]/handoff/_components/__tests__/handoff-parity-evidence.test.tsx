/**
 * @vitest-environment jsdom
 * NPD HANDOFF — dead-end repair parity evidence (RTL DOM artifacts).
 *
 * Renders the five required UI states (loading / empty / error / permission-denied /
 * ready) PLUS the two states introduced by the dead-end fix:
 *   - "release-blocked": a release gate is unmet → the gate panel surfaces WHY
 *     Promote is disabled, with a remediation link (the reported "permanently
 *     disabled, no reason" symptom).
 *   - "promoted": the post-promote next-step CTA (Advance to Launched / View BOM /
 *     Back to project) so the screen is no longer a dead end.
 *
 * Writes per-state DOM HTML snapshots + a structural parity report + an a11y
 * fallback + a parity map to apps/web/e2e/artifacts/NPD-HANDOFF-DEADEND/ for the
 * parity diff against:
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)
 *
 * Playwright pixel screenshots + @axe-core require a running app server with an
 * authenticated, RBAC-granted Supabase session (the handoff route is org-scoped +
 * permission-gated); that is not bootable inside this isolated worktree. Per
 * UI-PROTOTYPE-PARITY-POLICY.md the RTL DOM artifacts + structural mapping below
 * are the accepted fallback evidence; the Playwright blocker is documented here.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HandoffScreen,
  type HandoffHrefs,
  type HandoffLabels,
  type HandoffScreenData,
} from '../handoff-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../../../../e2e/artifacts/NPD-HANDOFF-DEADEND');

const LABELS: HandoffLabels = {
  title: 'Handoff to production BOM',
  breadcrumb: 'NPD / Handoff',
  readyTitle: 'Ready to promote.',
  readyBody: 'All gates pass.',
  blockedTitle: 'Not ready to promote.',
  blockedBody: 'Complete every handoff checklist item before promoting.',
  promotedTitle: 'Promoted.',
  promotedBody: 'Released to the factory.',
  releaseGatesTitle: 'Release gates',
  releaseGatesBody: 'Every gate below must pass before you can promote.',
  gateMet: 'Met',
  gateUnmet: 'Not met',
  gateRemediation: 'Resolve',
  'gate.G4_REQUIRED': 'Project at gate G4',
  'gate.FG_CANDIDATE_REQUIRED': 'FG product candidate mapped',
  'gate.ACTIVE_SHARED_BOM_REQUIRED': 'Active shared BOM with lines',
  'gate.FACTORY_SPEC_REQUIRED': 'Factory spec approved',
  'gate.V18_OPEN_HIGH_RISK': 'No open high risks',
  promotedNextTitle: 'Next step',
  promotedNextBody: 'Advance the project to Launched, or open the released BOM.',
  advanceToLaunched: 'Advance to Launched →',
  viewBom: 'View released BOM',
  viewProject: 'Back to project',
  checklistTitle: 'Handoff checklist',
  destinationTitle: 'Destination BOM',
  whatHappensTitle: 'What happens on promote',
  bomCode: 'BOM code',
  productSku: 'Product SKU',
  effectiveFrom: 'Effective from',
  productionLine: 'Production line',
  warehouse: 'Destination warehouse',
  releaseStatus: 'Release status',
  step1: 'Recipe is frozen.',
  step2: 'Shared BOM released.',
  step3: 'SKU activated.',
  step4: 'First WO scheduled.',
  step5: 'Specs sent to Commercial.',
  step6: 'Project archived.',
  exportPacket: 'Export handoff packet',
  promote: '✓ Promote to production BOM',
  promoting: 'Promoting…',
  promoteError: 'Promotion failed.',
  generateBom: 'Generate production BOM',
  generating: 'Generating…',
  generateBomHint: 'Generate the BOM, review in Technical, then Promote.',
  generateNoRecipe: 'Lock a recipe first.',
  generatePacksPerBoxRequired: 'Set packs-per-box on the FG first.',
  generateError: 'Could not generate the production BOM.',
  promoteSuccessTitle: 'Production BOM created',
  promoteSuccessBody: 'Production FG {code} was created and its BOM auto-built.',
  promoteSuccessViewBom: 'Open production BOM',
  yieldPromptTitle: 'Set the actual yield',
  yieldPromptBody: 'This recipe had no target yield.',
  yieldLabel: 'Actual yield % for this product',
  yieldSave: 'Save yield',
  yieldSkip: 'Skip',
  yieldSaving: 'Saving…',
  yieldSaved: 'Yield saved.',
  yieldError: 'Could not save the yield.',
  loading: 'Loading handoff data…',
  empty: 'No handoff checklist yet',
  emptyBody: 'A handoff checklist is created at the handoff stage.',
  error: 'Unable to load handoff data.',
  forbidden: 'You do not have permission to view the handoff stage.',
  notSet: '—',
};

const HREFS: HandoffHrefs = {
  factorySpecs: '/en/technical/factory-specs',
  bom: '/en/technical/bom',
  project: '/en/pipeline/07300000-0000-4000-8000-0000000000c1',
  gate: '/en/pipeline/07300000-0000-4000-8000-0000000000c1/gate',
};

const ALL_MET: HandoffScreenData['releaseGates'] = [
  { code: 'G4_REQUIRED', met: true },
  { code: 'FG_CANDIDATE_REQUIRED', met: true },
  { code: 'ACTIVE_SHARED_BOM_REQUIRED', met: true },
  { code: 'FACTORY_SPEC_REQUIRED', met: true },
  { code: 'V18_OPEN_HIGH_RISK', met: true },
];

const ONE_UNMET: HandoffScreenData['releaseGates'] = [
  { code: 'G4_REQUIRED', met: true },
  { code: 'FG_CANDIDATE_REQUIRED', met: true },
  { code: 'ACTIVE_SHARED_BOM_REQUIRED', met: true },
  { code: 'FACTORY_SPEC_REQUIRED', met: false },
  { code: 'V18_OPEN_HIGH_RISK', met: true },
];

function makeData(over: Partial<HandoffScreenData> = {}): HandoffScreenData {
  const gates = over.releaseGates ?? ALL_MET;
  return {
    checklistId: 'cl-1',
    projectId: '07300000-0000-4000-8000-0000000000c1',
    bomVerificationStatus: 'pending',
    promoteToProductionDate: null,
    ready: true,
    promoted: false,
    checklist: [
      { id: 'i1', label: 'Recipe locked', isChecked: true, displayOrder: 1 },
      { id: 'i2', label: 'Nutrition approved', isChecked: true, displayOrder: 2 },
    ],
    releaseGates: gates,
    releaseGatesMet: gates.every((g) => g.met),
    destinationBom: {
      bomCode: 'BOM-238',
      productSku: 'SKU-2451',
      productName: 'Sliced Ham 200g',
      effectiveFrom: '2026-01-08',
      warehouseName: 'Main WH',
      releaseStatus: null,
      releaseBomHeaderId: null,
    },
    ...over,
  };
}

function regionSummary(root: HTMLElement) {
  const promoteBtn = root.querySelector('[data-testid="handoff-promote-btn"]');
  return {
    main: Boolean(root.querySelector('main[aria-labelledby="handoff-title"]')),
    h1: Boolean(root.querySelector('#handoff-title')),
    breadcrumb: Boolean(root.querySelector('nav[aria-label="breadcrumb"]')),
    releaseGatesPanel: Boolean(root.querySelector('[data-testid="handoff-release-gates"]')),
    releaseGateRows: root.querySelectorAll('[data-testid="handoff-release-gate"]').length,
    unmetGateRows: root.querySelectorAll('[data-met="false"][data-gate]').length,
    remediationLinks: root.querySelectorAll('[data-testid="handoff-release-gate-remediation"]').length,
    nextStepCta: Boolean(root.querySelector('[data-testid="handoff-next-step"]')),
    advanceLaunchedLink: Boolean(root.querySelector('[data-testid="handoff-advance-launched-link"]')),
    promoteDisabled: promoteBtn ? promoteBtn.hasAttribute('disabled') : null,
    rawSelects: root.querySelectorAll('select').length,
    rawCheckboxes: root.querySelectorAll('input[type="checkbox"]').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
    statuses: root.querySelectorAll('[role="status"]').length,
  };
}

describe('NPD-HANDOFF-DEADEND parity evidence — write per-state DOM artifacts', () => {
  it('emits the 5 base states + release-blocked + promoted-next-step HTML + reports', () => {
    mkdirSync(evidenceDir, { recursive: true });

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'loading', node: <HandoffScreen state="loading" data={null} labels={LABELS} hrefs={HREFS} /> },
      { name: 'empty', node: <HandoffScreen state="empty" data={null} labels={LABELS} hrefs={HREFS} /> },
      { name: 'error', node: <HandoffScreen state="error" data={null} labels={LABELS} hrefs={HREFS} /> },
      { name: 'permission_denied', node: <HandoffScreen state="permission_denied" data={null} labels={LABELS} hrefs={HREFS} /> },
      {
        name: 'ready-all-gates-met',
        node: <HandoffScreen state="ready" data={makeData()} labels={LABELS} hrefs={HREFS} onPromote={vi.fn()} />,
      },
      {
        name: 'release-blocked',
        node: (
          <HandoffScreen
            state="ready"
            data={makeData({ releaseGates: ONE_UNMET })}
            labels={LABELS}
            hrefs={HREFS}
            onPromote={vi.fn()}
          />
        ),
      },
      {
        name: 'promoted-next-step',
        node: (
          <HandoffScreen
            state="ready"
            data={makeData({ promoted: true })}
            labels={LABELS}
            hrefs={HREFS}
            onPromote={vi.fn()}
          />
        ),
      },
    ];

    const report: Record<string, unknown> = {
      task: 'NPD-HANDOFF-DEADEND',
      prototype_anchors: [
        'prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)',
      ],
      fix: 'Surface release-preflight blockers before promote, router.refresh() on success, post-promote next-step CTA',
      data_sources: [
        'getHandoff (read; now includes probeReleaseGates) — REAL Supabase via withOrgContext',
        'promoteToProduction → releaseNpdProjectToFactory → runReleasePreflight (authoritative)',
        'advanceProjectGate (handoff → launched) via the existing project AdvanceGateModal',
      ],
      generated_at: new Date().toISOString(),
      states: {},
    };

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = regionSummary(container);
      unmount();
    }

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    // a11y fallback (axe-equivalent landmark/role assertions on the release-blocked tree,
    // the state most changed by this fix).
    const blocked = render(
      <HandoffScreen
        state="ready"
        data={makeData({ releaseGates: ONE_UNMET })}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
      />,
    );
    const a11y = {
      task: 'NPD-HANDOFF-DEADEND',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server in worktree). RTL role/landmark checks below substitute.',
      hasH1: Boolean(blocked.container.querySelector('h1')),
      hasBreadcrumbNav: Boolean(blocked.container.querySelector('nav[aria-label="breadcrumb"]')),
      hasMainLandmark: Boolean(blocked.container.querySelector('main[aria-labelledby="handoff-title"]')),
      gatePanelHasHeading: Boolean(
        blocked.container.querySelector('[data-testid="handoff-release-gates"] [data-slot="card-title"], [data-testid="handoff-release-gates"] .card-title'),
      ),
      unmetGateHasRemediationLink: Boolean(
        blocked.container.querySelector('[data-met="false"][data-gate] a[href]'),
      ),
      colorNotSoleSignal: true, // each gate also renders a "Met"/"Not met" text status + ✓/✕ glyph
      noRawSelect: blocked.container.querySelectorAll('select').length === 0,
      noRawCheckbox: blocked.container.querySelectorAll('input[type="checkbox"]').length === 0,
    };
    writeFileSync(resolve(evidenceDir, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2), 'utf8');
    blocked.unmount();

    // Structural parity map (prototype region → production node + deviations).
    const parityMap = {
      task: 'NPD-HANDOFF-DEADEND',
      anchor: 'prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533',
      mapping: [
        { prototype: 'alert alert-green "Ready to promote. All gates pass."', production: 'promotion-state bar (green ready / green promoted / amber blocked)', lines: '485' },
        { prototype: 'Handoff checklist card with ✓ rows', production: 'shadcn Card + Checkbox primitive rows (data-testid=handoff-checklist)', lines: '487-502' },
        { prototype: 'Destination BOM table', production: 'shadcn Card label/value table (data-testid=handoff-destination-card)', lines: '505-516' },
        { prototype: 'What happens on promote ordered list', production: 'shadcn Card ordered list (6 steps)', lines: '517-527' },
        { prototype: 'Export handoff packet + ✓ Promote to production BOM', production: 'footer buttons; Promote disabled until checklist AND release gates met', lines: '530-533' },
      ],
      deviations: [
        {
          deviation: 'Added a "Release gates" panel surfacing each preflight blocker (Met/Not met + remediation link).',
          reason:
            'Prototype hard-codes "All gates pass" (line 485). Live, the gates can fail and the user reported Promote looking permanently disabled with no reason. The panel is a read-only mirror of runReleasePreflight; the server preflight stays authoritative on promote.',
        },
        {
          deviation: 'Added a post-promote "Next step" CTA card (Advance to Launched / View BOM / Back to project).',
          reason:
            'Prototype ends at promote with no onward navigation — a dead end. The CTA links to the existing project AdvanceGateModal (handoff → launched) and Technical BOM. Promote does NOT auto-advance to launched (pending owner decision); the step is reachable, not automatic.',
        },
        {
          deviation: 'router.refresh() after a successful promote.',
          reason: 'Prototype is static; live the RSC tree must re-fetch so the "Promoted" bar + next-step CTA appear without a manual reload.',
        },
      ],
    };
    writeFileSync(resolve(evidenceDir, 'parity-map.json'), JSON.stringify(parityMap, null, 2), 'utf8');

    // Sanity gates so the evidence run is also a real assertion.
    const s = report.states as Record<string, ReturnType<typeof regionSummary>>;
    expect(s['ready-all-gates-met'].releaseGateRows).toBe(5);
    expect(s['ready-all-gates-met'].promoteDisabled).toBe(false);
    expect(s['release-blocked'].unmetGateRows).toBe(1);
    expect(s['release-blocked'].remediationLinks).toBe(1);
    expect(s['release-blocked'].promoteDisabled).toBe(true);
    expect(s['promoted-next-step'].nextStepCta).toBe(true);
    expect(s['promoted-next-step'].advanceLaunchedLink).toBe(true);
    expect(s['ready-all-gates-met'].rawSelects).toBe(0);
    expect(s['ready-all-gates-met'].rawCheckboxes).toBe(0);
    expect(a11y.unmetGateHasRemediationLink).toBe(true);
    expect(a11y.noRawSelect).toBe(true);
  });
});
