/**
 * T-028 — ReasonInput primitive
 * RED phase — tests MUST fail until ReasonInput.tsx and Textarea.tsx are created.
 *
 * Prototype source:
 *   prototypes/design/Monopilot Design System/settings/modals.jsx:72-108
 *   (FlagEditModal — "Audit reason" field with ReasonInput)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import React from 'react';
import ReasonInput from '../ReasonInput';

// ─────────────────────────────────────────────────────────────────────────────
// AC1: Structural, visual and interactional parity with modals.jsx:72-108
//      textarea + counter + submit-disabled-when-below-min
//      shadcn-style Textarea wrapper (NOT raw <textarea>)
//      counter updates on every keystroke
//      aria-describedby → counter element
//      parent submit button disabled while length < minLength
// ─────────────────────────────────────────────────────────────────────────────
describe('AC1: Structural / visual / interactional parity with modals.jsx:72-108', () => {
  it('renders a textarea wrapped in a shadcn-style Textarea component (not a bare <textarea>)', () => {
    const { container } = render(
      <ReasonInput name="reason" minLength={10} placeholder="Why?" />
    );

    // The raw <textarea> must exist (so text entry works)
    const rawTextarea = container.querySelector('textarea');
    expect(rawTextarea).not.toBeNull();

    // Walk up from the textarea — there must be a parent element bearing
    // data-slot="textarea" (the minimal Textarea wrapper marker the implementer
    // must add to packages/ui/src/Textarea.tsx, analogous to shadcn's pattern).
    let node: HTMLElement | null = rawTextarea!.parentElement;
    let foundWrapper = false;
    while (node) {
      if (node.dataset['slot'] === 'textarea') {
        foundWrapper = true;
        break;
      }
      node = node.parentElement;
    }
    expect(
      foundWrapper,
      'Expected to find an ancestor element with data-slot="textarea" (Textarea wrapper). ' +
      'Implementer must wrap <textarea> in packages/ui/src/Textarea.tsx and render it with data-slot="textarea".'
    ).toBe(true);
  });

  it('renders a live character counter below the textarea', () => {
    render(
      <ReasonInput name="reason" minLength={10} placeholder="Why?" />
    );

    // Counter must be in the DOM before any typing — shows 0/<min>+
    const counter = screen.getByTestId('reason-input-counter');
    expect(counter).toBeTruthy();
    expect(counter.textContent).toMatch(/^0\/10\+$/);
  });

  it('counter updates on every keystroke (mutation-proof)', async () => {
    const user = userEvent.setup();
    render(
      <ReasonInput name="reason" minLength={10} placeholder="Why?" />
    );

    const textarea = screen.getByRole('textbox');
    const counter = screen.getByTestId('reason-input-counter');

    // Type 3 chars — counter must update to 3/10+
    await user.type(textarea, 'abc');
    expect(counter).toHaveTextContent('3/10+');

    // Type 4 more — counter must update to 7/10+
    await user.type(textarea, 'defg');
    expect(counter).toHaveTextContent('7/10+');
  });

  it('textarea has aria-describedby that resolves to the counter element', () => {
    const { container } = render(
      <ReasonInput name="reason" minLength={10} placeholder="Why?" />
    );

    const textarea = screen.getByRole('textbox');
    const describedById = textarea.getAttribute('aria-describedby');

    expect(
      describedById,
      'textarea must have aria-describedby set'
    ).toBeTruthy();

    const counterEl = document.getElementById(describedById!);
    expect(
      counterEl,
      `aria-describedby="${describedById}" must resolve to an element in the document`
    ).not.toBeNull();

    // That element must be the counter (contains the n/min+ pattern)
    expect(counterEl!.textContent).toMatch(/\d+\/\d+\+/);
  });

  it('parent submit button is disabled while length < minLength', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <ReasonInput name="reason" minLength={10} placeholder="Why?" />
        <button data-testid="submit-btn" type="submit">
          Save change
        </button>
      </div>
    );

    const textarea = screen.getByRole('textbox');
    const submitBtn = screen.getByTestId('submit-btn');

    // Before any input the submit button must be aria-disabled='true'
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true');

    // Type enough to meet minLength — button must become enabled
    await user.type(textarea, 'abcdefghij'); // 10 chars = minLength
    // At exactly minLength, the button must NOT have aria-disabled='true'
    const ariaDisabled = submitBtn.getAttribute('aria-disabled');
    expect(ariaDisabled === null || ariaDisabled === 'false').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: minLength=10, user types 9 chars → submit has aria-disabled='true'
// ─────────────────────────────────────────────────────────────────────────────
describe('AC2: 9 chars typed with minLength=10 → submit aria-disabled="true"', () => {
  it('submit button has aria-disabled="true" when value length is below minLength', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <ReasonInput name="reason" minLength={10} placeholder="Why?" />
        <button data-testid="submit-btn" type="submit">
          Save change
        </button>
      </div>
    );

    const textarea = screen.getByRole('textbox');
    const submitBtn = screen.getByTestId('submit-btn');

    // Type exactly 9 chars — one short of minLength
    await user.type(textarea, '123456789');

    expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
  });

  it('counter shows 9/10+ when 9 chars are typed', async () => {
    const user = userEvent.setup();

    render(
      <ReasonInput name="reason" minLength={10} placeholder="Why?" />
    );

    const textarea = screen.getByRole('textbox');
    const counter = screen.getByTestId('reason-input-counter');

    await user.type(textarea, '123456789');

    expect(counter).toHaveTextContent('9/10+');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: user types 11 chars → submit enabled (no aria-disabled or 'false')
// ─────────────────────────────────────────────────────────────────────────────
describe('AC3: 11 chars typed with minLength=10 → submit is enabled', () => {
  it('submit button has no aria-disabled (or aria-disabled="false") after typing 11 chars', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <ReasonInput name="reason" minLength={10} placeholder="Why?" />
        <button data-testid="submit-btn" type="submit">
          Save change
        </button>
      </div>
    );

    const textarea = screen.getByRole('textbox');
    const submitBtn = screen.getByTestId('submit-btn');

    // Confirm disabled before typing
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true');

    // Type 11 chars — exceeds minLength
    await user.type(textarea, '12345678901');

    const ariaDisabled = submitBtn.getAttribute('aria-disabled');
    expect(
      ariaDisabled === null || ariaDisabled === 'false',
      `Expected submit button aria-disabled to be null or "false" after 11 chars, got "${ariaDisabled}"`
    ).toBe(true);
  });

  it('counter shows 11/10+ when 11 chars are typed', async () => {
    const user = userEvent.setup();

    render(
      <ReasonInput name="reason" minLength={10} placeholder="Why?" />
    );

    const textarea = screen.getByRole('textbox');
    const counter = screen.getByTestId('reason-input-counter');

    await user.type(textarea, '12345678901');

    expect(counter).toHaveTextContent('11/10+');
  });

  it('typing 11 chars then backspacing to 9 re-disables the submit button', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <ReasonInput name="reason" minLength={10} placeholder="Why?" />
        <button data-testid="submit-btn" type="submit">
          Save change
        </button>
      </div>
    );

    const textarea = screen.getByRole('textbox');
    const submitBtn = screen.getByTestId('submit-btn');

    // Enable first
    await user.type(textarea, '12345678901'); // 11 chars
    const afterEnabled = submitBtn.getAttribute('aria-disabled');
    expect(afterEnabled === null || afterEnabled === 'false').toBe(true);

    // Delete 2 chars → back to 9 (below minLength)
    await user.type(textarea, '{Backspace}{Backspace}');
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-067 (FT-007): aria-label prop + forwardRef
//   - aria-label forwarded to the underlying textarea
//   - ref points to the underlying textarea (focus() / value via ref)
//   - existing counter + aria-describedby still work alongside aria-label
//   - both label + aria-label → dev-only console.warn fires once
//   - zero axe-core violations
// ─────────────────────────────────────────────────────────────────────────────
describe('T-067: aria-label prop + forwardRef', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies aria-label to the underlying textarea and exposes it via getByLabelText', () => {
    render(<ReasonInput name="reason" minLength={10} aria-label="Audit reason" />);

    const labelled = screen.getByLabelText('Audit reason');
    expect(labelled.tagName.toLowerCase()).toBe('textarea');

    // Same element is the textbox role
    expect(labelled).toBe(screen.getByRole('textbox'));
  });

  it('forwards a ref to the underlying textarea (focus + value work via ref)', async () => {
    const user = userEvent.setup();
    const ref = React.createRef<HTMLTextAreaElement>();

    render(<ReasonInput ref={ref} name="reason" minLength={10} aria-label="Audit reason" />);

    // Ref resolves to the raw textarea node
    expect(ref.current).not.toBeNull();
    expect(ref.current!.tagName.toLowerCase()).toBe('textarea');

    // Focus restoration through the ref
    act(() => {
      ref.current!.focus();
    });
    expect(ref.current).toBe(document.activeElement);

    // Value reflects controlled input typed into the focused element
    await user.keyboard('reason text here');
    expect(ref.current!.value).toBe('reason text here');
  });

  it('keeps aria-describedby (counter) working when aria-label is set', () => {
    render(<ReasonInput name="reason" minLength={10} aria-label="Audit reason" />);

    const textarea = screen.getByRole('textbox');
    const describedById = textarea.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();

    const counterEl = document.getElementById(describedById!);
    expect(counterEl).not.toBeNull();
    expect(counterEl!.textContent).toMatch(/^0\/10\+$/);

    // aria-label coexists with the counter wiring
    expect(textarea).toHaveAttribute('aria-label', 'Audit reason');
  });

  it('warns once (dev-only) when both label and aria-label are provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ReasonInput
        name="reason"
        minLength={10}
        label="Audit reason"
        aria-label="Audit reason"
      />
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/aria-label/i);
  });

  it('renders a visible label when label is provided and prefers it for the accessible name', () => {
    render(<ReasonInput name="reason" minLength={10} label="Audit reason" />);

    // Visible label resolves the textbox by accessible name
    const textarea = screen.getByLabelText('Audit reason');
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
  });

  it('has zero axe-core violations with aria-label set (a11y holds)', async () => {
    const { container } = render(
      <div>
        <ReasonInput name="reason" minLength={10} aria-label="Audit reason" />
        <button type="submit">Save change</button>
      </div>
    );

    const results = await axe(container);
    expect(
      results.violations,
      results.violations.map((v) => v.id).join(', ')
    ).toEqual([]);
  });

  it('has zero axe-core violations with a visible label set (a11y holds)', async () => {
    const { container } = render(
      <div>
        <ReasonInput name="reason" minLength={10} label="Audit reason" />
        <button type="submit">Save change</button>
      </div>
    );

    const results = await axe(container);
    expect(
      results.violations,
      results.violations.map((v) => v.id).join(', ')
    ).toEqual([]);
  });
});
