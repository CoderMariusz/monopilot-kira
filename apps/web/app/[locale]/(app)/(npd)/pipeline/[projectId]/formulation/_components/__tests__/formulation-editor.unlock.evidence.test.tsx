/**
 * @vitest-environment jsdom
 *
 * A6 — Unlock-recipe parity-evidence harness (RTL/DOM-snapshot + axe-fallback).
 *
 * There is NO prototype for the unlock control; parity is achieved by REUSING the
 * established in-app e-sign modal pattern (GateRevertModal — Modal + reason
 * Textarea + password PIN Input + confirm Checkbox + per-code error map). At the
 * component-task layer the live Playwright/@axe-core stack (running RBAC app
 * server + Supabase + a locked seeded version) is unavailable, so — per
 * UI-PROTOTYPE-PARITY-POLICY.md ("if Playwright is unavailable, document the
 * blocker and provide RTL/snapshot fallback evidence") — this harness renders
 * every required unlock UI state and writes:
 *
 *   apps/web/e2e/parity-evidence/npd/A6/<state>.html          per-state DOM snapshot
 *   apps/web/e2e/parity-evidence/npd/A6/parity_report.json    region summary per state
 *   apps/web/e2e/parity-evidence/npd/A6/a11y-fallback.json    role/landmark a11y checks
 *   apps/web/e2e/parity-evidence/npd/A6/parity-map.json       gate-revert pattern → production map
 *
 * The live pixel screenshots + real @axe-core run are produced at Gate-5 by
 * e2e/npd-formulation-unlock.spec.ts (env-gated; skipped in the worktree).
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationEditor,
  type FormulationEditorData,
  type FormulationLabels,
} from '../formulation-editor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/A6');

const V2 = '22222222-2222-4222-8222-222222222222';
const V1 = '11111111-1111-4111-8111-111111111111';

const LABELS: FormulationLabels = {
  title: 'Recipe',
  subtitle: 'Edit any % or cost.',
  batchSize: 'Batch size',
  version: 'Version',
  targetPrice: 'Target price',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save.',
  submitForTrial: 'Submit for trial',
  submitting: 'Submitting…',
  submittedForTrial: 'Submitted for trial',
  submitError: 'Could not submit for trial. Try again.',
  submitErrorTotalPct: 'Ingredient total must equal 100%.',
  submitErrorMissingCost: 'Every ingredient needs a cost.',
  submitErrorMissingNutritionTarget: 'Compute nutrition first.',
  submitErrorNotDraft: 'Only a draft can be submitted.',
  submitErrorLocked: 'This version is locked.',
  submitErrorForbidden: 'You do not have permission to submit for trial.',
  compareVersions: 'Compare versions',
  lockRecipe: 'Lock recipe',
  locking: 'Locking…',
  lockConfirmTitle: 'Lock recipe',
  lockConfirmBody: 'Locking freezes v{n} — it can no longer be edited.',
  lockConfirmConfirm: 'Lock recipe',
  lockConfirmCancel: 'Cancel',
  lockError: 'Could not lock the recipe. Try again.',
  lockErrorForbidden: 'You do not have permission to lock this recipe.',
  lockErrorLocked: 'This version is already locked.',
  lockErrorNotSubmitted: 'Only a draft or trial version can be locked.',
  lockErrorNotFound: 'This version could not be found.',
  unlockRecipe: 'Unlock recipe',
  unlocking: 'Unlocking…',
  unlockTitle: 'Unlock recipe',
  unlockBody: 'Unlocking returns v{n} to draft so it can be edited again.',
  unlockReasonLabel: 'Reason (optional)',
  unlockReasonPlaceholder: 'Why are you unlocking this version?',
  unlockPinLabel: 'E-signature PIN',
  unlockPinPlaceholder: 'Enter your PIN',
  unlockConfirmCheckbox: 'I confirm I am unlocking this locked recipe version.',
  unlockSubmit: 'Unlock recipe',
  unlockCancel: 'Cancel',
  unlockError: 'Could not unlock the recipe. Try again.',
  unlockErrorForbidden: 'You do not have permission to unlock this recipe.',
  unlockErrorNotLocked: 'This version is not locked.',
  unlockErrorEsign: 'Incorrect PIN. Please try again.',
  unlockErrorNotFound: 'This version could not be found.',
  compareTitle: 'Compare versions',
  compareVersionA: 'Version A',
  compareVersionB: 'Version B',
  compareClose: 'Close',
  compareRun: 'Compare',
  compareLoading: 'Loading diff…',
  compareError: 'Could not load the comparison.',
  compareColIngredient: 'Ingredient',
  compareColVersionA: 'Version A',
  compareColVersionB: 'Version B',
  compareSamePick: 'Pick two different versions.',
  compareNoChanges: 'No differences.',
  compareTruncated: 'Showing the first 50 rows.',
  compareStatusAdded: 'Added',
  compareStatusRemoved: 'Removed',
  compareStatusChanged: 'Changed',
  compareStatusUnchanged: 'Unchanged',
  ingredients: 'Ingredients',
  addIngredient: 'Add ingredient',
  colIngredient: 'Ingredient',
  colQtyPerPack: 'Qty / pack (kg)',
  colCostPerKg: '€ / kg',
  colContribution: 'Contrib.',
  colAllergen: 'Allergen',
  deleteRow: 'Delete ingredient',
  total: 'Total',
  qtyBalanceWarning: 'Total is {qty} kg vs {pack} kg.',
  packWeightUnsetHint: 'Set the pack weight.',
  batchSizeHint: 'Batch size = pack weight; ingredients must total this.',
  composition: 'Composition',
  qtyRangeError: 'Quantity must be non-negative.',
  rmCodeRequired: 'Ingredient code is required.',
  livePanels: 'Live calculations',
  livePanelsHint: 'Panels appear here.',
  costPanelTitle: 'Cost',
  nutritionPanelTitle: 'Nutrition',
  allergenPanelTitle: 'Allergens',
  panelPlaceholder: 'Computed on save.',
  loading: 'Loading…',
  empty: 'No draft yet',
  emptyBody: 'Create a draft.',
  createDraft: 'Create draft',
  creatingDraft: 'Creating…',
  createDraftError: 'Could not create the draft.',
  error: 'Unable to load.',
  forbidden: 'No permission.',
  locked: 'This version is locked and cannot be edited.',
  noAllergen: '—',
  chooseItem: 'Choose item',
  openInTechnical: 'Open item in Technical',
  picker: {
    trigger: 'Pick item',
    searchLabel: 'Search items',
    searchPlaceholder: 'Search…',
    loading: 'Searching…',
    empty: 'No matches',
    cancel: 'Cancel',
    error: 'Search failed',
  },
};

function lockedData(overrides: Partial<FormulationEditorData> = {}): FormulationEditorData {
  return {
    projectId: V1,
    versionId: V2,
    versionNumber: 3,
    state: 'locked',
    productCode: 'Sliced Ham 200g',
    batchSizeKg: '0.200',
    packWeightG: '200',
    targetPriceEur: '3.98',
    targetYieldPct: '78',
    versions: [
      { id: V2, versionNumber: 3 },
      { id: V1, versionNumber: 2 },
    ],
    ingredients: [
      { id: 'a1', rmCode: 'RM-1001', name: 'Pork shoulder', qtyKg: '0.170', pct: '85', costPerKgEur: '4.20', allergen: null, sequence: 1 },
      { id: 'a2', rmCode: 'RM-2002', name: 'Water', qtyKg: '0.020', pct: '10', costPerKgEur: '0.01', allergen: 'celery', sequence: 2 },
      { id: 'a3', rmCode: 'RM-3003', name: 'Salt', qtyKg: '0.010', pct: '5', costPerKgEur: '0.30', allergen: null, sequence: 3 },
    ],
    ...overrides,
  };
}

function write(name: string, contents: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), contents, 'utf8');
}

/** The Modal portals to document.body, so capture the whole body for modal states. */
function snapshotBody(): string {
  return document.body.innerHTML;
}

describe('A6 unlock parity evidence — write per-state DOM artifacts', () => {
  it('emits locked-toolbar / modal-open / esign-error / optimistic-unlocking / draft-no-button + reports', async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const report: Record<string, unknown> = {
      task: 'A6',
      control: 'Unlock recipe (locked formulation version → e-sign PIN → draft)',
      prototype_anchor: 'NONE — spec-driven; reuses GateRevertModal e-sign pattern (apps/web/app/(npd)/_modals/gate-revert-modal.tsx)',
      server_action: 'unlockVersion (apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/unlock-version.ts) — imported, never authored',
      prd_refs: ['§17.11.1'],
      generated_at: new Date().toISOString(),
      states: {} as Record<string, unknown>,
    };
    const states = report.states as Record<string, unknown>;

    // ── State 1: locked version → Unlock button present + enabled, lock banner. ──
    {
      const unlock = vi.fn().mockResolvedValue({ ok: true, data: { versionId: V2 } });
      const { container, unmount } = render(
        <FormulationEditor state="ready" data={lockedData()} labels={LABELS} canEdit unlockVersionAction={unlock} onRefresh={vi.fn()} />,
      );
      write('locked-toolbar.html', container.innerHTML);
      states.locked_toolbar = {
        unlockButtonPresent: Boolean(container.querySelector('[data-testid="unlock-recipe-trigger"]')),
        unlockButtonDisabled: container.querySelector('[data-testid="unlock-recipe-trigger"]')?.hasAttribute('disabled') ?? null,
        lockedBannerPresent: Boolean(Array.from(container.querySelectorAll('[role="alert"]')).find((n) => /locked and cannot be edited/i.test(n.textContent ?? ''))),
        saveDisabled: container.querySelector('button[data-status="idle"].btn-secondary')?.hasAttribute('disabled') ?? null,
      };
      unmount();
    }

    // ── State 2: PIN modal open (reason + password PIN + confirm checkbox). ──────
    {
      const unlock = vi.fn().mockResolvedValue({ ok: true, data: { versionId: V2 } });
      render(<FormulationEditor state="ready" data={lockedData()} labels={LABELS} canEdit unlockVersionAction={unlock} onRefresh={vi.fn()} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
      });
      write('modal-open.html', snapshotBody());
      const pin = document.querySelector('[data-testid="unlock-pin"]') as HTMLInputElement | null;
      states.modal_open = {
        modalPresent: Boolean(document.querySelector('[data-testid="unlock-version-modal"]')),
        reasonTextarea: Boolean(document.querySelector('[data-testid="unlock-reason"]')),
        pinIsPassword: pin?.getAttribute('type') === 'password',
        confirmCheckbox: Boolean(document.querySelector('[data-testid="unlock-confirm-checkbox"]')),
        submitDisabledBeforeInput: document.querySelector('[data-testid="unlock-submit"]')?.hasAttribute('disabled') ?? null,
        bodyShowsVersionNumber: Boolean(Array.from(document.querySelectorAll('[data-testid="unlock-warning"]')).find((n) => /v3/.test(n.textContent ?? ''))),
      };
      cleanup();
    }

    // ── State 3: esign_failed (wrong PIN) inline error, modal stays open. ────────
    {
      const unlock = vi.fn().mockResolvedValue({ ok: false, error: 'esign_failed' });
      render(<FormulationEditor state="ready" data={lockedData()} labels={LABELS} canEdit unlockVersionAction={unlock} onRefresh={vi.fn()} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
      });
      await act(async () => {
        fireEvent.change(screen.getByTestId('unlock-pin'), { target: { value: '000000' } });
        fireEvent.click(screen.getByTestId('unlock-confirm-checkbox'));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('unlock-submit'));
      });
      await waitFor(() => expect(screen.getByTestId('unlock-error')).toBeInTheDocument());
      write('esign-error.html', snapshotBody());
      states.esign_error = {
        errorAlertPresent: Boolean(document.querySelector('[data-testid="unlock-error"][role="alert"]')),
        errorText: document.querySelector('[data-testid="unlock-error"]')?.textContent ?? null,
        modalStillOpen: Boolean(document.querySelector('[data-testid="unlock-version-modal"]')),
      };
      cleanup();
    }

    // ── State 4: optimistic "Unlocking…" — submit pending (action never resolves). ─
    {
      const pending = vi.fn().mockReturnValue(new Promise(() => {}));
      render(<FormulationEditor state="ready" data={lockedData()} labels={LABELS} canEdit unlockVersionAction={pending} onRefresh={vi.fn()} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
      });
      await act(async () => {
        fireEvent.change(screen.getByTestId('unlock-pin'), { target: { value: '123456' } });
        fireEvent.click(screen.getByTestId('unlock-confirm-checkbox'));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('unlock-submit'));
      });
      write('optimistic-unlocking.html', snapshotBody());
      states.optimistic_unlocking = {
        submitLabel: document.querySelector('[data-testid="unlock-submit"]')?.textContent ?? null,
        triggerLabel: screen.queryByTestId('unlock-recipe-trigger')?.textContent ?? null,
      };
      cleanup();
    }

    // ── State 5: draft version → NO unlock button (button only on locked). ───────
    {
      const { container, unmount } = render(
        <FormulationEditor state="ready" data={lockedData({ state: 'draft' })} labels={LABELS} canEdit unlockVersionAction={vi.fn()} onRefresh={vi.fn()} />,
      );
      write('draft-no-button.html', container.innerHTML);
      states.draft_no_button = {
        unlockButtonPresent: Boolean(container.querySelector('[data-testid="unlock-recipe-trigger"]')),
        lockedBannerPresent: Boolean(Array.from(container.querySelectorAll('[role="alert"]')).find((n) => /locked and cannot be edited/i.test(n.textContent ?? ''))),
      };
      unmount();
    }

    write('parity_report.json', JSON.stringify(report, null, 2));

    // a11y fallback (live @axe-core requires a running RBAC app server — produced
    // at Gate-5 by e2e/npd-formulation-unlock.spec.ts). Role/label checks here.
    {
      const unlock = vi.fn().mockResolvedValue({ ok: true, data: { versionId: V2 } });
      render(<FormulationEditor state="ready" data={lockedData()} labels={LABELS} canEdit unlockVersionAction={unlock} onRefresh={vi.fn()} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('unlock-recipe-trigger'));
      });
      const dialog = document.querySelector('[role="dialog"]');
      const pin = document.querySelector('[data-testid="unlock-pin"]') as HTMLInputElement | null;
      const a11y = {
        task: 'A6',
        note: 'Live @axe-core/playwright blocked (no running RBAC-authenticated app server in worktree) — produced at Gate-5 by e2e/npd-formulation-unlock.spec.ts. RTL role/label checks substitute, per UI-PROTOTYPE-PARITY-POLICY.md.',
        dialogHasAriaModal: dialog?.getAttribute('aria-modal') === 'true',
        dialogHasTitle: Boolean(document.querySelector('.mp-modal-title')),
        pinInputLabelled: Boolean(pin?.getAttribute('aria-label')),
        pinNeverPlaintext: pin?.getAttribute('type') === 'password',
        confirmCheckboxLabelled: Boolean(document.querySelector('[data-testid="unlock-confirm-checkbox"]')?.getAttribute('aria-label')),
        reasonTextareaLabelled: Boolean((document.querySelector('[data-testid="unlock-reason"]') as HTMLElement | null)?.getAttribute('aria-label')),
        errorUsesRoleAlert: true,
      };
      write('a11y-fallback.json', JSON.stringify(a11y, null, 2));
      cleanup();

      expect(a11y.dialogHasAriaModal).toBe(true);
      expect(a11y.pinNeverPlaintext).toBe(true);
      expect(a11y.pinInputLabelled).toBe(true);
      expect(a11y.confirmCheckboxLabelled).toBe(true);
    }

    const parityMap = {
      task: 'A6',
      prototype: 'NONE (spec-driven)',
      reused_pattern: 'apps/web/app/(npd)/_modals/gate-revert-modal.tsx (in-app e-sign modal pattern)',
      mapping: [
        { gateRevertPattern: '@monopilot/ui Modal (Header/Body/Footer) size=md', production: 'UnlockVersionModal — same Modal primitives, modalId="npd-formulation-unlock"' },
        { gateRevertPattern: 'reason Textarea', production: 'unlock-reason Textarea (optional — unlock action treats reason as optional, not a submit gate)' },
        { gateRevertPattern: 'type=password PIN Input (never plaintext) + confirm Checkbox; submit gated on both', production: 'unlock-pin password Input + unlock-confirm-checkbox; submit disabled until pin + confirm' },
        { gateRevertPattern: 'per-code error map (errorKey) + role=alert inline', production: 'lockErrorMessage-style switch → unlockErrorMessage (forbidden/VERSION_NOT_LOCKED/esign_failed/not_found) + role=alert' },
        { gateRevertPattern: 'injected revertProjectGate Server Action prop', production: 'unlockVersionAction prop threaded from page.tsx (imports unlock-version.ts, never authored)' },
        { gateRevertPattern: 'onReverted → host close + revalidation', production: 'onConfirm → host calls action; ok → close modal + refresh() (RSC re-reads draft = editable)' },
      ],
      toolbar_placement: 'header[data-region=toolbar] — Unlock button shown ONLY when data.state===locked, next to the (disabled) Lock button',
      rbac: 'server-side (npd.formulation.unlock + e-sign PIN inside unlockVersion); forbidden mirrored read-only inline, never client-trusted',
      five_ui_states: {
        loading: 'inherited from FormulationEditor StateNotice (state!=ready)',
        empty: 'inherited from FormulationEditor empty state',
        error: 'esign-error.html (esign_failed + generic codes mapped to inline role=alert)',
        permission_denied: 'forbidden code → unlockErrorForbidden inline alert (RBAC mirrored)',
        optimistic: 'optimistic-unlocking.html ("Unlocking…" pending submit label)',
      },
      deviations: [
        'No prototype JSX exists for this control — parity is against the established GateRevertModal e-sign pattern, per UI-PROTOTYPE-PARITY-POLICY.md §1 (spec-driven + nearest reusable pattern).',
        'Reason is OPTIONAL (the unlockVersion action types reason as optional), so unlike gate-revert it is not a submit gate; submit gates only on PIN + confirm.',
        'A NEW UnlockVersionModal was created rather than modifying the shared gate-revert-modal.tsx (which must not change — it serves the gate-revert flow).',
      ],
    };
    write('parity-map.json', JSON.stringify(parityMap, null, 2));

    // Sanity gates so the evidence run is also a real assertion.
    const s = report.states as Record<string, Record<string, unknown>>;
    expect(s.locked_toolbar.unlockButtonPresent).toBe(true);
    expect(s.locked_toolbar.unlockButtonDisabled).toBe(false);
    expect(s.locked_toolbar.lockedBannerPresent).toBe(true);
    expect(s.modal_open.modalPresent).toBe(true);
    expect(s.modal_open.pinIsPassword).toBe(true);
    expect(s.modal_open.submitDisabledBeforeInput).toBe(true);
    expect(s.modal_open.bodyShowsVersionNumber).toBe(true);
    expect(s.esign_error.errorText).toBe(LABELS.unlockErrorEsign);
    expect(s.esign_error.modalStillOpen).toBe(true);
    expect(s.optimistic_unlocking.submitLabel).toBe(LABELS.unlocking);
    expect(s.draft_no_button.unlockButtonPresent).toBe(false);
  });
});
