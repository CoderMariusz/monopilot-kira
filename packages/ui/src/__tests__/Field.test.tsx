/**
 * T-027 — Field primitive RED tests
 *
 * Tests intentionally fail:
 *   - Field.tsx does not exist yet
 *   - react-hook-form and zod are not installed in packages/ui
 *
 * Canonical prototype reference:
 *   prototypes/design/Monopilot Design System/settings/access-screens.jsx:139-145
 *
 * Structure from prototype (lines 139-145):
 *   <div className="field">
 *     <label>Email address</label>
 *     <input type="email" ... />        ← Field must wrap this in a shadcn Input
 *   </div>
 *   + optional hint/error below input
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
// These imports will fail at module resolution — that is the RED state.
// react-hook-form and zod are not yet installed in packages/ui.
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Field from '../Field';

// ---------------------------------------------------------------------------
// Helper: render Field inside a FormProvider with optional Zod schema
// ---------------------------------------------------------------------------
interface WrapperProps {
  schema?: z.ZodTypeAny;
  defaultValues?: Record<string, unknown>;
  children: React.ReactNode;
}

function FormWrapper({ schema, defaultValues = {}, children }: WrapperProps) {
  const methods = useForm({
    mode: 'onBlur',
    resolver: schema ? zodResolver(schema) : undefined,
    defaultValues,
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

// ---------------------------------------------------------------------------
// AC1 — Structural / visual / interactional parity with access-screens.jsx:139-145
// ---------------------------------------------------------------------------
describe('AC1: structural, visual, and interactional parity (access-screens.jsx:139-145)', () => {
  it('renders label above the input (label-on-top structure)', () => {
    render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" />
      </FormWrapper>
    );

    const label = screen.getByText('Email address');
    expect(label).toBeInTheDocument();

    // The rendered input must exist below the label in the DOM
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    // label must come before the input in DOM order
    const labelEl = screen.getByText('Email address');
    const inputEl = screen.getByRole('textbox');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    expect(labelEl.compareDocumentPosition(inputEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('renders hint text below the input when provided', () => {
    render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" hint="Enter a valid work email" />
      </FormWrapper>
    );

    const hint = screen.getByText('Enter a valid work email');
    expect(hint).toBeInTheDocument();

    const input = screen.getByRole('textbox');
    // hint must come after the input in DOM order
    expect(input.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('wraps the input in a shadcn-style Input component (NOT a raw <input>)', () => {
    const { container } = render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" />
      </FormWrapper>
    );

    // The underlying <input> must be inside an element with data-slot="input"
    // (shadcn Input wrapper convention). Walking up from the <input> element:
    const rawInput = container.querySelector('input');
    expect(rawInput).not.toBeNull();

    // Walk up ancestors to find the shadcn wrapper marker
    let el: Element | null = rawInput!.parentElement;
    let foundSlot = false;
    while (el) {
      if (el.getAttribute('data-slot') === 'input') {
        foundSlot = true;
        break;
      }
      el = el.parentElement;
    }
    expect(foundSlot).toBe(true);
  });

  it('error message replaces hint text when validation error is present', async () => {
    const schema = z.object({
      email: z.string().email('Must be a valid email'),
    });

    render(
      <FormWrapper schema={schema} defaultValues={{ email: '' }}>
        <Field name="email" label="Email address" type="email" hint="Enter a valid work email" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');
    // Type invalid value and blur
    await userEvent.type(input, 'not-an-email');
    fireEvent.blur(input);

    await waitFor(() => {
      // Error message is visible
      expect(screen.getByText('Must be a valid email')).toBeInTheDocument();
    });

    // Original hint must no longer be in the document
    expect(screen.queryByText('Enter a valid work email')).not.toBeInTheDocument();
  });

  it('sets aria-invalid="true" on the input when there is a validation error', async () => {
    const schema = z.object({
      email: z.string().email('Must be a valid email'),
    });

    render(
      <FormWrapper schema={schema} defaultValues={{ email: '' }}>
        <Field name="email" label="Email address" type="email" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'bad');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('triggers validation on blur (onBlur mode)', async () => {
    const schema = z.object({
      email: z.string().min(1, 'Email is required'),
    });

    render(
      <FormWrapper schema={schema} defaultValues={{ email: '' }}>
        <Field name="email" label="Email address" type="email" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');
    // No error before blur
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
  });

  it('triggers validation on submit as well as blur', async () => {
    const schema = z.object({
      email: z.string().min(1, 'Email is required'),
    });

    const TestForm = () => {
      const methods = useForm({
        mode: 'onBlur',
        resolver: zodResolver(schema),
        defaultValues: { email: '' },
      });
      return (
        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(() => {})}>
            <Field name="email" label="Email address" type="email" />
            <button type="submit">Submit</button>
          </form>
        </FormProvider>
      );
    };

    render(<TestForm />);

    // Do NOT blur — submit directly
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// AC2 — Zod schema rejection on blur → aria-invalid + error message in DOM
// ---------------------------------------------------------------------------
describe('AC2: Zod schema rejects value → blur → aria-invalid + error text below input', () => {
  it('renders error message below the input after blur with invalid value', async () => {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
    });

    const { container } = render(
      <FormWrapper schema={schema} defaultValues={{ email: '' }}>
        <Field name="email" label="Email" type="email" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'notvalid');
    fireEvent.blur(input);

    await waitFor(() => {
      const errorMsg = screen.getByText('Invalid email address');
      expect(errorMsg).toBeInTheDocument();

      // Error element must appear after the input in the DOM
      expect(input.compareDocumentPosition(errorMsg) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });
  });

  it('sets aria-invalid="true" on the input element after blur with Zod rejection', async () => {
    const schema = z.object({
      username: z
        .string()
        .min(3, 'Username must be at least 3 characters')
        .regex(/^[a-z]+$/, 'Username must be lowercase letters only'),
    });

    render(
      <FormWrapper schema={schema} defaultValues={{ username: '' }}>
        <Field name="username" label="Username" type="text" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'AB'); // too short AND uppercase
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('clears aria-invalid and error text when value becomes valid after blur', async () => {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
    });

    render(
      <FormWrapper schema={schema} defaultValues={{ email: '' }}>
        <Field name="email" label="Email" type="email" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');

    // First blur with invalid value
    await userEvent.type(input, 'bad');
    fireEvent.blur(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    // Clear and type valid value, then blur
    await userEvent.clear(input);
    await userEvent.type(input, 'valid@example.com');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText('Invalid email address')).not.toBeInTheDocument();
    });
  });

  it('wires aria-describedby from input to the error element', async () => {
    const schema = z.object({
      email: z.string().email('Must be valid'),
    });

    const { container } = render(
      <FormWrapper schema={schema} defaultValues={{ email: '' }}>
        <Field name="email" label="Email" type="email" />
      </FormWrapper>
    );

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'x');
    fireEvent.blur(input);

    await waitFor(() => {
      const describedById = input.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();

      const errorEl = container.querySelector(`#${describedById}`);
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toContain('Must be valid');
    });
  });
});

// ---------------------------------------------------------------------------
// AC3 — required=true → visible asterisk with aria-label="required"
// ---------------------------------------------------------------------------
describe('AC3: required=true renders a visible asterisk with aria-label="required"', () => {
  it('renders an asterisk element when required=true', () => {
    render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" required={true} />
      </FormWrapper>
    );

    // The asterisk must be queryable by its aria-label
    const asterisk = screen.getByLabelText('required');
    expect(asterisk).toBeInTheDocument();
    expect(asterisk.textContent).toContain('*');
  });

  it('asterisk has aria-label="required" on the wrapping span', () => {
    const { container } = render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" required={true} />
      </FormWrapper>
    );

    const asterisk = container.querySelector('[aria-label="required"]');
    expect(asterisk).not.toBeNull();
    expect(asterisk!.tagName.toLowerCase()).toBe('span');
  });

  it('asterisk is not interactive (no button/link role, no tabIndex)', () => {
    render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" required={true} />
      </FormWrapper>
    );

    const asterisk = screen.getByLabelText('required');

    // Must not be a button or anchor
    expect(asterisk.tagName.toLowerCase()).not.toBe('button');
    expect(asterisk.tagName.toLowerCase()).not.toBe('a');

    // Must not be focusable via tab
    const tabIndex = asterisk.getAttribute('tabindex');
    expect(tabIndex === null || Number(tabIndex) < 0).toBe(true);
  });

  it('does NOT render asterisk when required is omitted or false', () => {
    const { container } = render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" />
      </FormWrapper>
    );

    const asterisk = container.querySelector('[aria-label="required"]');
    expect(asterisk).toBeNull();
  });

  it('label associates with the input (getByLabelText resolves to the input)', () => {
    render(
      <FormWrapper>
        <Field name="email" label="Email address" type="email" required={true} />
      </FormWrapper>
    );

    // getByLabelText should find the input via the label text
    const input = screen.getByLabelText(/Email address/);
    expect(input).toBeInTheDocument();
    expect(input.tagName.toLowerCase()).toBe('input');
  });
});
