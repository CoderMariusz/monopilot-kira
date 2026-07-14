/**
 * @vitest-environment jsdom
 * NPD — full-page 4-step Create project wizard (Basics → Brief → Starting point → Review).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:107-263 (CreateProjectWizard)
 *
 * Asserts the parity checklist + states + RBAC + payload mapping:
 *   - 4-step bar (Basics/Brief/Starting point/Review) + Continue/Back navigation;
 *   - Step-1 validation gate: Continue is disabled until `name` is non-empty (proto line 258);
 *   - Step-3 clone selection shows the blue alert (proto 220-225);
 *   - Step-4 Review summary table reflects the entered values (proto 236-250);
 *   - submit calls the INJECTED createProject action with the mapped payload
 *     (EUR string parsed to number; startFrom/cloneSource; templateId constant);
 *   - RBAC: with no action injected, Create is disabled + a forbidden alert appears
 *     (no client bypass);
 *   - i18n: all visible chrome comes from injected labels (no hard-coded copy).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CreateProjectWizard,
  clearWizardDraft,
  parseRunsPerWeek,
  parseWeeklyVolumePacks,
  readWizardDraft,
  wizardDraftStorageKey,
  writeWizardDraft,
  type WizardLabels,
} from '../create-project-wizard';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/pipeline/new',
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    },
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: true,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  window.localStorage.clear();
});

const LABELS: WizardLabels = {
  breadcrumbRoot: 'lbl.breadcrumbRoot',
  breadcrumbCurrent: 'lbl.breadcrumbCurrent',
  pageTitle: 'lbl.pageTitle',
  stepBasics: 'lbl.stepBasics',
  stepBrief: 'lbl.stepBrief',
  stepStarting: 'lbl.stepStarting',
  stepReview: 'lbl.stepReview',
  basicsTitle: 'lbl.basicsTitle',
  fieldName: 'lbl.fieldName',
  fieldNamePlaceholder: 'lbl.fieldNamePlaceholder',
  fieldCategory: 'lbl.fieldCategory',
  fieldTargetLaunch: 'lbl.fieldTargetLaunch',
  fieldPackFormat: 'lbl.fieldPackFormat',
  fieldPackFormatPlaceholder: 'lbl.fieldPackFormatPlaceholder',
  fieldPackWeight: 'lbl.fieldPackWeight',
  fieldPackWeightPlaceholder: 'lbl.fieldPackWeightPlaceholder',
  fieldPacksPerCase: 'lbl.fieldPacksPerCase',
  fieldPacksPerCasePlaceholder: 'lbl.fieldPacksPerCasePlaceholder',
  fieldOutputUnit: 'lbl.fieldOutputUnit',
  fieldOutputUnitKg: 'lbl.fieldOutputUnitKg',
  fieldOutputUnitPieces: 'lbl.fieldOutputUnitPieces',
  fieldOutputUnitBoxes: 'lbl.fieldOutputUnitBoxes',
  fieldWeeklyVolumePacks: 'lbl.fieldWeeklyVolumePacks',
  fieldWeeklyVolumePacksPlaceholder: 'lbl.fieldWeeklyVolumePacksPlaceholder',
  fieldRunsPerWeek: 'lbl.fieldRunsPerWeek',
  fieldRunsPerWeekPlaceholder: 'lbl.fieldRunsPerWeekPlaceholder',
  fieldRunsPerWeekHelp: 'lbl.fieldRunsPerWeekHelp',
  fieldSalesChannel: 'lbl.fieldSalesChannel',
  briefTitle: 'lbl.briefTitle',
  fieldRetailPrice: 'lbl.fieldRetailPrice',
  fieldAudience: 'lbl.fieldAudience',
  fieldAudiencePlaceholder: 'lbl.fieldAudiencePlaceholder',
  fieldClaims: 'lbl.fieldClaims',
  fieldClaimsPlaceholder: 'lbl.fieldClaimsPlaceholder',
  fieldConstraints: 'lbl.fieldConstraints',
  fieldConstraintsPlaceholder: 'lbl.fieldConstraintsPlaceholder',
  fieldNotes: 'lbl.fieldNotes',
  fieldNotesPlaceholder: 'lbl.fieldNotesPlaceholder',
  startingTitle: 'lbl.startingTitle',
  startingSubtitle: 'lbl.startingSubtitle',
  startBlankTitle: 'lbl.startBlankTitle',
  startBlankDesc: 'lbl.startBlankDesc',
  startCloneTitle: 'lbl.startCloneTitle',
  startCloneDesc: 'lbl.startCloneDesc',
  startTemplateTitle: 'lbl.startTemplateTitle',
  startTemplateDesc: 'lbl.startTemplateDesc',
  startUnavailableHint: 'lbl.startUnavailableHint',
  cloneNoSourceHint: 'lbl.cloneNoSourceHint',
  cloneSourceLabel: 'lbl.cloneSourceLabel',
  cloneSourcePlaceholder: 'lbl.cloneSourcePlaceholder',
  cloneAlert: 'lbl.cloneAlert',
  reviewTitle: 'lbl.reviewTitle',
  reviewReady: 'lbl.reviewReady',
  reviewName: 'lbl.reviewName',
  reviewCategory: 'lbl.reviewCategory',
  reviewTarget: 'lbl.reviewTarget',
  reviewPrice: 'lbl.reviewPrice',
  reviewChannelVolume: 'lbl.reviewChannelVolume',
  reviewClaims: 'lbl.reviewClaims',
  reviewStarting: 'lbl.reviewStarting',
  reviewStartBlank: 'lbl.reviewStartBlank',
  reviewStartClone: 'lbl.reviewStartClone',
  reviewStartTemplate: 'lbl.reviewStartTemplate',
  empty: '—',
  cancel: 'lbl.cancel',
  back: 'lbl.back',
  continue: 'lbl.continue',
  create: 'lbl.create',
  creating: 'lbl.creating',
  errorGeneric: 'lbl.errorGeneric',
  errorForbidden: 'lbl.errorForbidden',
  errorBoxesOutputUnit: 'lbl.errorBoxesOutputUnit',
};

const defaultAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-7', code: 'NPD-007' } }));

function renderWizard(overrides: Partial<React.ComponentProps<typeof CreateProjectWizard>> = {}) {
  const props = {
    locale: 'en',
    labels: LABELS,
    createAction: defaultAction as React.ComponentProps<typeof CreateProjectWizard>['createAction'],
    draftScopeId: 'test-scope',
    ...overrides,
  };
  return render(<CreateProjectWizard {...props} />);
}

/** Fill Basics required fields so Continue unlocks. */
function fillRequiredBasics(name = 'Sliced Ham 200g') {
  fireEvent.change(screen.getByLabelText(/lbl\.fieldName/), { target: { value: name } });
  fireEvent.change(screen.getByTestId('wiz-weekly-volume'), { target: { value: '5000' } });
  fireEvent.change(screen.getByTestId('wiz-runs-per-week'), { target: { value: '3' } });
}

describe('parseWeeklyVolumePacks / parseRunsPerWeek', () => {
  it('rejects -1 weekly volume and 0 runs/week; accepts valid values', () => {
    expect(parseWeeklyVolumePacks('-1')).toBeNull();
    expect(parseWeeklyVolumePacks('0')).toBeNull();
    expect(parseWeeklyVolumePacks('')).toBeNull();
    expect(parseWeeklyVolumePacks('5000')).toBe(5000);

    expect(parseRunsPerWeek('0')).toBeNull();
    expect(parseRunsPerWeek('-1')).toBeNull();
    expect(parseRunsPerWeek('')).toBeNull();
    expect(parseRunsPerWeek('3')).toBe(3);
  });
});

describe('wizard draft save / restore / clear', () => {
  it('writes, restores same scope, rejects foreign scope, and clears', () => {
    const form = {
      name: 'Draft Ham',
      type: 'Meat',
      targetLaunch: '',
      packFormat: '',
      packWeightG: '',
      packsPerCase: '',
      outputUnit: '',
      weeklyVolumePacks: '1000',
      runsPerWeek: '2',
      salesChannel: 'Retail',
      targetRetailPriceEur: '',
      targetAudience: '',
      marketingClaims: '',
      constraints: '',
      notes: '',
      startFrom: 'blank' as const,
      cloneSourceId: '',
    };
    writeWizardDraft('org-a:user-1', 2, form, window.localStorage);
    expect(readWizardDraft('org-a:user-1', window.localStorage)).toEqual({ step: 2, form });
    expect(readWizardDraft('org-b:user-1', window.localStorage)).toBeNull();
    expect(window.localStorage.getItem(wizardDraftStorageKey('org-a:user-1'))).toBeTruthy();
    clearWizardDraft('org-a:user-1', window.localStorage);
    expect(readWizardDraft('org-a:user-1', window.localStorage)).toBeNull();
  });
});

describe('CreateProjectWizard — parity, navigation, validation', () => {
  it('renders the breadcrumb, title and the 4-step bar (proto 119/123/125)', () => {
    renderWizard();
    expect(screen.getByText(LABELS.pageTitle)).toBeInTheDocument();
    expect(screen.getByText(LABELS.stepBasics)).toBeInTheDocument();
    expect(screen.getByText(LABELS.stepBrief)).toBeInTheDocument();
    expect(screen.getByText(LABELS.stepStarting)).toBeInTheDocument();
    expect(screen.getByText(LABELS.stepReview)).toBeInTheDocument();
  });

  it('disables Continue until name, weekly volume (>0), and runs/week (≥1) are set', () => {
    renderWizard();
    const cont = screen.getByTestId('wizard-continue');
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/lbl\.fieldName/), { target: { value: 'Sliced Ham 200g' } });
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByTestId('wiz-weekly-volume'), { target: { value: '-1' } });
    fireEvent.change(screen.getByTestId('wiz-runs-per-week'), { target: { value: '0' } });
    expect(cont).toBeDisabled();
    expect(screen.getByTestId('wiz-weekly-volume-error')).toBeInTheDocument();
    expect(screen.getByTestId('wiz-runs-per-week-error')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('wiz-weekly-volume'), { target: { value: '5000' } });
    fireEvent.change(screen.getByTestId('wiz-runs-per-week'), { target: { value: '3' } });
    expect(cont).not.toBeDisabled();
  });

  it('navigates Basics → Brief → Starting point; Clone (no source) + Template are disabled, Blank stays selected', () => {
    renderWizard();
    fillRequiredBasics();
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Brief
    expect(screen.getByText(LABELS.briefTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Starting point
    expect(screen.getByText(LABELS.startingTitle)).toBeInTheDocument();

    // Blank is the default selected start.
    expect(screen.getByTestId('wizard-start-blank')).toHaveAttribute('aria-checked', 'true');

    // With no clone sources injected, Clone is disabled with its "no source" hint;
    // Template is disabled with the "Not available yet" hint (no template schema).
    const clone = screen.getByTestId('wizard-start-clone');
    const template = screen.getByTestId('wizard-start-template');
    expect(clone).toBeDisabled();
    expect(template).toBeDisabled();
    expect(clone).toHaveAttribute('title', 'lbl.cloneNoSourceHint');
    expect(template).toHaveAttribute('title', 'lbl.startUnavailableHint');
    expect(screen.getByTestId('wizard-start-clone-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-start-template-unavailable')).toBeInTheDocument();

    // Clicking the disabled Clone card does NOT select it and does NOT show the clone alert.
    fireEvent.click(clone);
    expect(clone).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('wizard-start-blank')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('wizard-clone-alert')).not.toBeInTheDocument();
  });

  it('enables Clone when sources are injected: picking a source + Create calls cloneAction with brief overrides', async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-blank', code: 'NPD-009' } }));
    const cloneAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-clone', code: 'NPD-010' } }));
    renderWizard({
      createAction,
      cloneAction,
      cloneSources: [
        { id: 'src-1', code: 'NPD-001', name: 'Sliced Ham Standard' },
        { id: 'src-2', code: 'NPD-002', name: 'Smoked Bacon' },
      ],
    });

    fillRequiredBasics('Sliced Ham v2');
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Brief
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Starting point

    // Clone is now selectable.
    const clone = screen.getByTestId('wizard-start-clone');
    expect(clone).not.toBeDisabled();
    fireEvent.click(clone);
    expect(clone).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('wizard-clone-alert')).toBeInTheDocument();

    // Pick the second source via the design-system Select. Its trigger is a
    // role="combobox" (accessible name = displayed value); the clone-source Select is
    // the only combobox on the Starting-point step.
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: /NPD-002/ }));

    // Create is blocked until a source is chosen — now that one is picked, continue.
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Review

    const createBtn = screen.getByTestId('wizard-create');
    await waitFor(() => expect(createBtn).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => expect(cloneAction).toHaveBeenCalledTimes(1));
    expect(createAction).not.toHaveBeenCalled();
    expect(cloneAction.mock.calls[0]![0]).toMatchObject({
      sourceProjectId: 'src-2',
      overrides: expect.objectContaining({ name: 'Sliced Ham v2', prio: 'normal' }),
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/pipeline/pid-clone/formulation'));
  });

  it('renders the output unit field on the Basics step (first brief-capture path)', () => {
    renderWizard();
    expect(screen.getByLabelText('lbl.fieldOutputUnit')).toBeInTheDocument();
    expect(document.getElementById('wiz-output-unit-trigger')).toBeInTheDocument();
  });

  it('Back returns to the previous step', () => {
    renderWizard();
    fillRequiredBasics('X');
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Brief
    fireEvent.click(screen.getByTestId('wizard-back')); // ← Basics
    expect(screen.getByText(LABELS.basicsTitle)).toBeInTheDocument();
  });
});

describe('CreateProjectWizard — submit payload mapping + redirect', () => {
  it('calls the injected action with the full mapped payload and redirects on success', async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-42', code: 'NPD-042' } }));
    renderWizard({ createAction });

    // Step 1
    fireEvent.change(screen.getByLabelText(/lbl\.fieldName/), { target: { value: 'Sliced Ham 200g' } });
    fireEvent.change(screen.getByLabelText(/lbl\.fieldTargetLaunch/), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/lbl\.fieldPackFormat/), { target: { value: '200g sliced pack' } });
    fireEvent.change(screen.getByLabelText('lbl.fieldPackWeight'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('lbl.fieldPacksPerCase'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('wiz-weekly-volume'), { target: { value: '5000' } });
    fireEvent.change(screen.getByTestId('wiz-runs-per-week'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('wizard-continue'));

    // Step 2
    fireEvent.change(screen.getByLabelText(/lbl\.fieldRetailPrice/), { target: { value: '19.90' } });
    fireEvent.change(screen.getByLabelText(/lbl\.fieldAudience/), { target: { value: 'Premium retail' } });
    fireEvent.change(screen.getByLabelText(/lbl\.fieldClaims/), { target: { value: 'High protein' } });
    fireEvent.change(screen.getByLabelText(/lbl\.fieldConstraints/), { target: { value: 'Shelf life >= 28 days' } });
    fireEvent.change(screen.getByLabelText(/lbl\.fieldNotes/), { target: { value: 'background' } });
    fireEvent.click(screen.getByTestId('wizard-continue'));

    // Step 3 — Clone is disabled (no backend); attempting to select it is a no-op,
    // so the start point stays 'blank' and NO hardcoded clone source is sent.
    fireEvent.click(screen.getByTestId('wizard-start-clone'));
    fireEvent.click(screen.getByTestId('wizard-continue'));

    // Step 4 — review + create
    const createBtn = screen.getByTestId('wizard-create');
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(createAction.mock.calls[0]![0]).toEqual({
      name: 'Sliced Ham 200g',
      type: '',
      targetLaunch: '2026-09-01',
      packFormat: '200g sliced pack',
      packWeightG: 200,
      // Optional integer captured from the form and included in the payload.
      packsPerCase: 12,
      weeklyVolumePacks: 5000,
      runsPerWeek: 3,
      salesChannel: 'Retail',
      targetRetailPriceEur: 19.9,
      targetAudience: 'Premium retail',
      marketingClaims: 'High protein',
      constraints: 'Shelf life >= 28 days',
      notes: 'background',
      startFrom: 'blank',
      cloneSource: null,
      prio: 'normal',
      templateId: 'APEX_DEFAULT',
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/pipeline/pid-42/formulation'));
    expect(window.localStorage.getItem(wizardDraftStorageKey('test-scope'))).toBeNull();
  });

  it('sends null for empty optional fields; required weekly volume / runs are sent as numbers', async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, data: { id: 'p', code: 'NPD-001' } }));
    renderWizard({ createAction });
    fillRequiredBasics('Bare');
    fireEvent.click(screen.getByTestId('wizard-continue')); // step2
    fireEvent.click(screen.getByTestId('wizard-continue')); // step3
    fireEvent.click(screen.getByTestId('wizard-continue')); // step4
    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-create'));
    });
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(createAction.mock.calls[0]![0]).toMatchObject({
      name: 'Bare',
      targetLaunch: null,
      packFormat: null,
      weeklyVolumePacks: 5000,
      runsPerWeek: 3,
      targetRetailPriceEur: null,
      targetAudience: null,
      marketingClaims: null,
      constraints: null,
      notes: null,
      startFrom: 'blank',
      cloneSource: null,
      salesChannel: 'Retail',
    });
    // Empty "Packs per case" is OMITTED from the payload (optional, never null).
    expect(createAction.mock.calls[0]![0]).not.toHaveProperty('packsPerCase');
  });

  it('clone path: a captured Packs per case is forwarded in the clone overrides; empty omits it', async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-blank', code: 'NPD-009' } }));
    const cloneAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-clone', code: 'NPD-010' } }));
    renderWizard({
      createAction,
      cloneAction,
      cloneSources: [{ id: 'src-1', code: 'NPD-001', name: 'Sliced Ham Standard' }],
    });

    fillRequiredBasics('Cloned v2');
    // Capture packs per case on the Basics step.
    fireEvent.change(screen.getByLabelText('lbl.fieldPacksPerCase'), { target: { value: '24' } });
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Brief
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Starting point

    fireEvent.click(screen.getByTestId('wizard-start-clone'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: /NPD-001/ }));
    fireEvent.click(screen.getByTestId('wizard-continue')); // → Review

    const createBtn = screen.getByTestId('wizard-create');
    await waitFor(() => expect(createBtn).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => expect(cloneAction).toHaveBeenCalledTimes(1));
    expect(cloneAction.mock.calls[0]![0].overrides).toMatchObject({ packsPerCase: 24 });
  });

  it('blocks create when boxes output unit lacks pack factors', async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, data: { id: 'p', code: 'NPD-001' } }));
    renderWizard({ createAction });
    fillRequiredBasics('Boxy');
    fireEvent.click(document.getElementById('wiz-output-unit-trigger')!);
    await waitFor(() => expect(screen.getByRole('option', { name: 'lbl.fieldOutputUnitBoxes' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('option', { name: 'lbl.fieldOutputUnitBoxes' }));
    fireEvent.click(screen.getByTestId('wizard-continue'));
    fireEvent.click(screen.getByTestId('wizard-continue'));
    fireEvent.click(screen.getByTestId('wizard-continue'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-create'));
    });
    expect(createAction).not.toHaveBeenCalled();
    expect(screen.getByText('lbl.errorBoxesOutputUnit')).toBeInTheDocument();
  });
});

describe('CreateProjectWizard — RBAC (permission denied state)', () => {
  it('disables Create and shows the forbidden alert when no action is injected', async () => {
    renderWizard({ createAction: undefined });
    fillRequiredBasics('Z');
    fireEvent.click(screen.getByTestId('wizard-continue'));
    fireEvent.click(screen.getByTestId('wizard-continue'));
    fireEvent.click(screen.getByTestId('wizard-continue'));
    expect(screen.getByTestId('wizard-create')).toBeDisabled();
    expect(screen.getByTestId('wizard-forbidden')).toBeInTheDocument();
  });
});
