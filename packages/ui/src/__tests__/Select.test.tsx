/**
 * Select.test.tsx — popover behavior for the shared Select primitive.
 *
 * Regression guard for the systemic "every dropdown renders its options
 * inline / always-visible" bug. The old Select.tsx rendered the
 * role="listbox" content unconditionally (no `open` state, aria-expanded
 * hardcoded to "false", no CSS to hide it), so every Select in the app showed
 * all of its options at once.
 *
 * These tests assert the fixed contract:
 *   - options absent from the DOM until the trigger is activated
 *   - clicking the trigger opens the listbox (options appear)
 *   - selecting an option closes the listbox AND fires onValueChange
 *   - Escape closes
 *   - click-outside closes
 *   - ArrowDown + Enter keyboard flow selects
 *   - aria-expanded / aria-controls reflect open state
 *   - the `options`-prop fallback API still works (no children)
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectOption,
} from '../Select';

const OPTIONS: SelectOption[] = [
  { value: 'quality', label: 'Quality' },
  { value: 'preparation', label: 'Preparation' },
  { value: 'processing', label: 'Processing' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'logistics', label: 'Logistics' },
];

/** Compositional usage (SelectTrigger/SelectContent/SelectItem). */
function Compositional({
  onValueChange,
  value,
}: {
  onValueChange?: (v: string) => void;
  value?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} options={OPTIONS}>
      <SelectTrigger aria-label="Category">
        <SelectValue placeholder="Pick…" />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

describe('Select — closed by default', () => {
  it('does NOT render options until the trigger is activated', () => {
    render(<Compositional />);
    // The listbox and its options must be absent from the DOM while closed.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Quality' })).toBeNull();
    OPTIONS.forEach((o) => {
      expect(screen.queryByRole('option', { name: o.label })).toBeNull();
    });
  });

  it('trigger reports collapsed a11y state when closed', () => {
    render(<Compositional />);
    const trigger = screen.getByRole('combobox', { name: 'Category' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });
});

describe('Select — open on click', () => {
  it('shows all options after clicking the trigger', async () => {
    const user = userEvent.setup();
    render(<Compositional />);

    await user.click(screen.getByRole('combobox', { name: 'Category' }));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    OPTIONS.forEach((o) => {
      expect(screen.getByRole('option', { name: o.label })).toBeInTheDocument();
    });
  });

  it('updates aria-expanded / aria-controls when open', async () => {
    const user = userEvent.setup();
    render(<Compositional />);
    const trigger = screen.getByRole('combobox', { name: 'Category' });

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(trigger).toHaveAttribute('aria-controls', listbox.id);
  });
});

describe('Select — selection', () => {
  it('selecting an option closes the listbox AND fires onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Compositional onValueChange={onValueChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(screen.getByRole('option', { name: 'Processing' }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('processing');
    // Listbox is gone after selection.
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select — dismissal', () => {
  it('Escape closes the listbox', async () => {
    const user = userEvent.setup();
    render(<Compositional />);

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('click-outside closes the listbox', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Compositional />
        <button type="button">outside</button>
      </div>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // mousedown outside the root triggers the click-outside handler.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select — keyboard flow', () => {
  it('ArrowDown opens + moves focus, Enter selects + closes + fires onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Compositional onValueChange={onValueChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Category' });
    trigger.focus();

    // ArrowDown opens the listbox.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // On open, focus lands on the first option (Quality). ArrowDown moves to the
    // second (Preparation).
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Preparation' })).toHaveFocus();

    // Enter selects the focused option.
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('preparation');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select — production readability contract', () => {
  // Regression guard for the prod-only "unreadable dropdown on Vercel" bug.
  // ROOT CAUSE: the stylesheet was `Select.module.css`, so Next/Turbopack
  // hashed the selectors while the markup used the LITERAL `select__content`
  // string — the shipped CSS never matched the DOM and the popover rendered
  // with no background/z-index. The component must emit the literal,
  // un-hashed class so the (now plain) stylesheet applies.
  it('renders the listbox with the literal `select__content` class', async () => {
    const user = userEvent.setup();
    render(<Compositional />);
    await user.click(screen.getByRole('combobox', { name: 'Category' }));

    const listbox = screen.getByRole('listbox');
    // Literal class (not a hashed CSS-module name) — this is what the shipped
    // plain stylesheet targets.
    expect(listbox).toHaveClass('select__content');
    expect(listbox.className).not.toMatch(/module__/);
    // Each option carries the literal item class too.
    screen.getAllByRole('option').forEach((opt) => {
      expect(opt).toHaveClass('select__item');
    });
  });

  it('portals the listbox to <body> so ancestor overflow/stacking cannot clip it', async () => {
    const user = userEvent.setup();
    render(
      <div style={{ overflow: 'hidden' }} data-testid="clipping-ancestor">
        <Compositional />
      </div>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Category' }));

    const listbox = screen.getByRole('listbox');
    const clippingAncestor = screen.getByTestId('clipping-ancestor');
    // The listbox must NOT live inside the (overflow:hidden) ancestor; it is
    // portaled to document.body and positioned fixed.
    expect(clippingAncestor.contains(listbox)).toBe(false);
    expect(listbox.style.position).toBe('fixed');
  });
});

describe('Select — options-prop fallback API', () => {
  it('renders via options prop (no children) and stays closed until clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select aria-label="Fallback" options={OPTIONS} onValueChange={onValueChange} />,
    );

    // Closed by default — no inline options.
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Logistics' }));
    expect(onValueChange).toHaveBeenCalledWith('logistics');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
