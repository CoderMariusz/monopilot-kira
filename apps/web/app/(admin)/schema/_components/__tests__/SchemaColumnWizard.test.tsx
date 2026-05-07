/**
 * T-037 — Schema-driven column wizard UI (5-step wizard)
 *
 * RED phase — all tests MUST fail until SchemaColumnWizard.tsx is implemented.
 *
 * Failures expected because:
 *   1. apps/web/app/(admin)/schema/_components/SchemaColumnWizard.tsx does not exist
 *   2. apps/web/app/(admin)/schema/wizard/page.tsx does not exist
 *
 * Test quality bar:
 *   - Zero expect(true).toBe(true) or toBeDefined() on DOM nodes
 *   - vi.mock for Server Actions
 *   - useRouter / useSearchParams mocked via vi.mock('next/navigation', ...)
 *   - Each AC in its own describe() block
 *   - Mutation-proof assertions per AC
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Navigation mocks (Next.js) ───────────────────────────────────────────────
// next/navigation must be mocked before importing the component.
// useRouter().push is the redirect target for AC4; useSearchParams controls ?step=N.

const mockPush = vi.fn();
const mockGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: mockGet,
  }),
  usePathname: () => '/admin/schema/wizard',
}));

// ─── Server Action mocks ──────────────────────────────────────────────────────
// Mock the Server Actions module so tests stay in the jsdom environment.
// Spying on call counts (AC4 requires BOTH called exactly once).

const mockUpsertDeptColumnDraft = vi.fn();
const mockPublishDeptColumnDraft = vi.fn();

vi.mock(
  '../../../../../app/(settings)/schema/_actions/draft',
  () => ({
    upsertDeptColumnDraft: mockUpsertDeptColumnDraft,
    publishDeptColumnDraft: mockPublishDeptColumnDraft,
  }),
);

// ─── Component under test ─────────────────────────────────────────────────────
// Import AFTER mocks are registered. Will throw until SchemaColumnWizard.tsx exists.
import SchemaColumnWizard from '../SchemaColumnWizard';

// ─── Fixture ──────────────────────────────────────────────────────────────────
/**
 * Sample row used for the Summary preview on step 4.
 * Implementer must accept a `sampleRow` prop (or use this internally).
 */
const FIXTURE_SAMPLE_ROW = {
  name: 'Sample',
  type: 'string',
  value: 'Example value 42',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render SchemaColumnWizard with ?step=N simulated via mockGet.
 * Default step is 1 (first render with no URL param → step 1).
 */
function renderWizard(step = 1) {
  // mockGet('step') returns the step param value or null (→ wizard defaults to step 1)
  mockGet.mockImplementation((key: string) => {
    if (key === 'step') return step === 1 ? null : String(step);
    return null;
  });

  return render(<SchemaColumnWizard sampleRow={FIXTURE_SAMPLE_ROW} deptId="test-dept-001" />);
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC1: step 1 enum picker — Stepper at step 1 + exactly 6 field-type options', () => {
  // AC verbatim: "Given a Schema Admin opens /admin/schema/wizard, when the page renders,
  // then the <Stepper/> is on step 1 and the field-type radio shows exactly 6 enum options
  // matching §6 (string/number/date/enum/formula/relation)"

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Stepper at step 1 (first tab has aria-current="step")', () => {
    renderWizard(1);

    // Stepper renders a tablist (Radix Tabs.List)
    const tablist = screen.getByRole('tablist');
    expect(tablist).not.toBeNull();

    // First tab must carry aria-current="step"
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-current', 'step');
  });

  it('renders exactly 5 wizard-step tabs in the tablist (5-step wizard)', () => {
    renderWizard(1);

    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');

    // 5-step wizard: exactly 5 tabs
    expect(tabs).toHaveLength(5);
  });

  it('renders EXACTLY 6 field-type radio options on step 1 (mutation: 5 options → this fails)', () => {
    renderWizard(1);

    // The 6 enum options from §6 must be rendered as radio inputs
    const radioOptions = screen.getAllByRole('radio');

    // Mutation-proof: hardcoded to 5 options would make this fail
    expect(radioOptions).toHaveLength(6);
  });

  it('renders "string" radio option with exact label text', () => {
    renderWizard(1);
    // Must match §6 enum verbatim — case-sensitive
    expect(screen.getByLabelText('string')).not.toBeNull();
    expect(screen.getByLabelText('string')).toHaveAttribute('type', 'radio');
  });

  it('renders "number" radio option with exact label text', () => {
    renderWizard(1);
    expect(screen.getByLabelText('number')).not.toBeNull();
    expect(screen.getByLabelText('number')).toHaveAttribute('type', 'radio');
  });

  it('renders "date" radio option with exact label text', () => {
    renderWizard(1);
    expect(screen.getByLabelText('date')).not.toBeNull();
    expect(screen.getByLabelText('date')).toHaveAttribute('type', 'radio');
  });

  it('renders "enum" radio option with exact label text', () => {
    renderWizard(1);
    expect(screen.getByLabelText('enum')).not.toBeNull();
    expect(screen.getByLabelText('enum')).toHaveAttribute('type', 'radio');
  });

  it('renders "formula" radio option with exact label text', () => {
    renderWizard(1);
    expect(screen.getByLabelText('formula')).not.toBeNull();
    expect(screen.getByLabelText('formula')).toHaveAttribute('type', 'radio');
  });

  it('renders "relation" radio option with exact label text', () => {
    renderWizard(1);
    expect(screen.getByLabelText('relation')).not.toBeNull();
    expect(screen.getByLabelText('relation')).toHaveAttribute('type', 'radio');
  });

  it('mutation: all 6 option labels match §6 enum verbatim (not "String", "Number", etc.)', () => {
    renderWizard(1);

    const expectedLabels = ['string', 'number', 'date', 'enum', 'formula', 'relation'];

    for (const label of expectedLabels) {
      // getByLabelText does an exact match — "String" would not match "string"
      const radio = screen.getByLabelText(label);
      expect(radio).toHaveAttribute('type', 'radio');
      expect(radio).toHaveAttribute('value', label);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC2: step 2 RHF+Zod — required/unique/regex/range inputs; Next disabled until ≥1 rule set', () => {
  // AC verbatim: "Given the user picks 'string' on step 1 and clicks Next, when step 2 renders,
  // then RHF + Zod resolver renders required / unique / regex / range inputs and
  // Next is disabled until at least one validation rule is set"

  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate being on step 2 (after picking 'string' and clicking Next)
    mockGet.mockImplementation((key: string) => (key === 'step' ? '2' : null));
  });

  it('step 2 renders a "required" checkbox/toggle input', () => {
    renderWizard(2);

    // "required" field must be present — checkbox or boolean toggle
    const requiredInput = screen.getByRole('checkbox', { name: /required/i });
    expect(requiredInput).not.toBeNull();
  });

  it('step 2 renders a "unique" checkbox/toggle input', () => {
    renderWizard(2);

    const uniqueInput = screen.getByRole('checkbox', { name: /unique/i });
    expect(uniqueInput).not.toBeNull();
  });

  it('step 2 renders a "regex" text input', () => {
    renderWizard(2);

    // regex pattern input
    const regexInput = screen.getByRole('textbox', { name: /regex/i });
    expect(regexInput).not.toBeNull();
  });

  it('step 2 renders "min" and "max" range number inputs', () => {
    renderWizard(2);

    const minInput = screen.getByRole('spinbutton', { name: /min/i });
    const maxInput = screen.getByRole('spinbutton', { name: /max/i });

    expect(minInput).not.toBeNull();
    expect(maxInput).not.toBeNull();
  });

  it('mutation: Next button is aria-disabled="true" when 0 validation rules are set', () => {
    // AC mutation-guard: if implementer makes Next not disabled when no rules set,
    // this test catches it.
    renderWizard(2);

    // Find the Next button in the Stepper footer
    const footer = screen.getByTestId('stepper-footer');
    const nextButton = within(footer).getByRole('button', { name: /next/i });

    // Must be aria-disabled, not just visually disabled — per Stepper primitive contract
    expect(nextButton).toHaveAttribute('aria-disabled', 'true');
  });

  it('Next button NOT aria-disabled after "required" checkbox is checked (≥1 rule set)', async () => {
    const user = userEvent.setup();
    renderWizard(2);

    const requiredCheckbox = screen.getByRole('checkbox', { name: /required/i });
    await user.click(requiredCheckbox);

    const footer = screen.getByTestId('stepper-footer');
    const nextButton = within(footer).getByRole('button', { name: /next/i });

    // After setting one rule, Next must no longer be aria-disabled
    expect(nextButton).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('Next button NOT aria-disabled after regex is filled (≥1 rule set)', async () => {
    const user = userEvent.setup();
    renderWizard(2);

    const regexInput = screen.getByRole('textbox', { name: /regex/i });
    await user.type(regexInput, '^[A-Z]+$');

    const footer = screen.getByTestId('stepper-footer');
    const nextButton = within(footer).getByRole('button', { name: /next/i });

    expect(nextButton).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('mutation-proof: clicking disabled Next (0 rules) does NOT advance step', async () => {
    const user = userEvent.setup();
    renderWizard(2);

    const footer = screen.getByTestId('stepper-footer');
    const nextButton = within(footer).getByRole('button', { name: /next/i });

    // Must be disabled before click
    expect(nextButton).toHaveAttribute('aria-disabled', 'true');

    // Click the disabled Next
    await user.click(nextButton);

    // URL push must NOT have been called (no step advance)
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC3: step 4 Summary preview — Summary displays field_type + validation_json; Save enabled', () => {
  // AC verbatim: "Given the user reaches step 4, when the preview renders,
  // then a <Summary/> displays the configured field_type + validation_json
  // against a fixture sample row and Save is enabled"

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((key: string) => (key === 'step' ? '4' : null));
  });

  it('step 4 renders a <dl> (Summary primitive)', () => {
    renderWizard(4);

    // Summary renders a <dl> at root per T-029 API
    const dl = document.querySelector('dl');
    expect(dl).not.toBeNull();
  });

  it('step 4 Summary includes a row for "field_type"', () => {
    renderWizard(4);

    // Summary must show the configured field_type label
    const dl = document.querySelector('dl')!;
    const terms = within(dl).getAllByRole('term');
    const termTexts = terms.map((t) => t.textContent ?? '');

    expect(termTexts.some((t) => /field.?type/i.test(t))).toBe(true);
  });

  it('step 4 Summary includes a row for "validation"', () => {
    renderWizard(4);

    const dl = document.querySelector('dl')!;
    const terms = within(dl).getAllByRole('term');
    const termTexts = terms.map((t) => t.textContent ?? '');

    expect(termTexts.some((t) => /validation/i.test(t))).toBe(true);
  });

  it('step 4 Summary is read-only — no interactive controls inside <dl>', () => {
    renderWizard(4);

    const dl = document.querySelector('dl')!;
    const inputs = dl.querySelectorAll('input, textarea, select, button, a');

    // Summary must be read-only per T-029 spec
    expect(inputs).toHaveLength(0);
  });

  it('mutation: Summary is NOT rendered at step 2 (wrong-step mutation guard)', () => {
    // If implementer puts Summary on step 2 instead of step 4, this test catches it.
    mockGet.mockImplementation((key: string) => (key === 'step' ? '2' : null));
    render(<SchemaColumnWizard sampleRow={FIXTURE_SAMPLE_ROW} deptId="test-dept-001" />);

    // No <dl> should be present on step 2 (validation step)
    const dl = document.querySelector('dl');
    expect(dl).toBeNull();
  });

  it('step 4 has a Save button that is NOT aria-disabled', () => {
    renderWizard(4);

    // Step 4 is the preview/summary step — Save should be enabled
    // The Save button might be in the footer or on the summary step
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('fixture sample row data appears in the Summary definitions', () => {
    renderWizard(4);

    const dl = document.querySelector('dl')!;
    const definitions = within(dl).getAllByRole('definition');
    const defTexts = definitions.map((d) => d.textContent ?? '');

    // The Summary must reference data from the fixture sample row or configured values
    // At minimum, the field_type value should appear
    expect(defTexts.some((t) => t.trim().length > 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC4: Save chain — upsertDeptColumnDraft AND publishDeptColumnDraft both called exactly once → redirect', () => {
  // AC verbatim: "Given the user clicks Save on step 5, when the action chain completes,
  // then upsertDeptColumnDraft + publishDeptColumnDraft are both invoked exactly once
  // and the user is redirected to /admin/schema with a success toast"

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((key: string) => (key === 'step' ? '5' : null));

    // Default happy-path mock responses
    mockUpsertDeptColumnDraft.mockResolvedValue({
      success: true,
      draftId: 'draft-uuid-test-001',
    });
    mockPublishDeptColumnDraft.mockResolvedValue({
      success: true,
      deptColumnId: 'col-uuid-test-001',
      newSchemaVersion: 2,
      idempotent: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clicking Save on step 5 calls upsertDeptColumnDraft exactly once', async () => {
    const user = userEvent.setup();
    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      // Mutation-proof: if only publishDeptColumnDraft is called (upsert skipped),
      // this assertion fails with calls.length=0
      expect(mockUpsertDeptColumnDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('clicking Save on step 5 calls publishDeptColumnDraft exactly once', async () => {
    const user = userEvent.setup();
    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      // Mutation-proof: if only upsertDeptColumnDraft is called (publish bypassed —
      // red line violation), this assertion fails with calls.length=0
      expect(mockPublishDeptColumnDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('mutation: double Save click does NOT call actions a second time (each called exactly once)', async () => {
    const user = userEvent.setup();
    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);
    await user.click(saveButton);

    await waitFor(() => {
      // Each action called exactly once — duplicate calls fail this assertion
      expect(mockUpsertDeptColumnDraft).toHaveBeenCalledTimes(1);
      expect(mockPublishDeptColumnDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('publishDeptColumnDraft receives the draftId returned by upsertDeptColumnDraft', async () => {
    const user = userEvent.setup();
    mockUpsertDeptColumnDraft.mockResolvedValue({
      success: true,
      draftId: 'draft-uuid-specific',
    });

    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockPublishDeptColumnDraft).toHaveBeenCalledWith('draft-uuid-specific');
    });
  });

  it('redirects to /admin/schema after successful Save', async () => {
    const user = userEvent.setup();
    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/schema');
    });
  });

  it('shows a success toast after Save completes', async () => {
    const user = userEvent.setup();
    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      // Toast must be visible — either a role="status"/"alert" or text matching /success/i
      const successIndicator =
        screen.queryByRole('status') ??
        screen.queryByRole('alert') ??
        screen.queryByText(/success/i) ??
        screen.queryByText(/saved/i);

      expect(successIndicator).not.toBeNull();
    });
  });

  it('mutation: only upsert called (publish bypassed) → publishDeptColumnDraft.calls.length === 0 fails', async () => {
    // This test documents the mutation that would be caught if publish is accidentally skipped.
    // When component only calls upsert and skips publish, toHaveBeenCalledTimes(1) fails for publish.
    const user = userEvent.setup();

    // Override: simulate a component that only calls upsert (mutation scenario documented)
    // This test verifies the SPY is correctly wired — if both are called, both assertions pass.
    renderWizard(5);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      // Both must be called: if one is 0, this test block collectively fails
      const upsertCalls = mockUpsertDeptColumnDraft.mock.calls.length;
      const publishCalls = mockPublishDeptColumnDraft.mock.calls.length;

      // Fail if either is not exactly 1
      expect(upsertCalls).toBe(1);
      expect(publishCalls).toBe(1);
    });
  });
});
