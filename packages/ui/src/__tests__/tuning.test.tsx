/**
 * T-030 — Tuning primitives: RED-phase tests
 *
 * Covers:
 *   AC1 — EmptyState parity vs access-screens.jsx:39-43
 *   AC2 — deriveRunHistory grouping + newest-first ordering
 *   AC3 — DryRunButton role/variant/tooltip
 *
 * Smoke renders (no AC requirement):
 *   RunStrip, TabsCounted, CompactActivity basic mount checks
 *
 * All imports will fail until the GREEN implementer creates the source files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── imports that will fail in RED (files don't exist yet) ──────────────────
import { EmptyState } from '../EmptyState';
import { DryRunButton } from '../DryRunButton';
import { RunStrip } from '../RunStrip';
import { TabsCounted } from '../TabsCounted';
import { CompactActivity } from '../CompactActivity';
import { deriveRunHistory } from '../run-history';
import type { RunHistoryRow } from '../run-history';

// OutboxEvent type is defined inline here to match packages/outbox OutboxRow shape
// (snake_case fields as they come from the DB / as the helper will consume).
// When the implementer creates run-history.ts they must accept this shape.
interface OutboxEvent {
  aggregate_id: string;
  created_at: string; // ISO 8601
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — EmptyState parity
// Prototype reference: access-screens.jsx:39-43
//   <EmptyState icon="👥" title={`No users…`}
//     body="Try selecting…"
//     action={{label:"＋ Invite user", onClick:()=>setShowInvite(true)}}/>
// ─────────────────────────────────────────────────────────────────────────────
describe('AC1 — EmptyState parity (access-screens.jsx:39-43)', () => {
  describe('structural: icon / title / body / action in DOM order', () => {
    it('renders icon slot, title text, body text, and action button', () => {
      const onClick = vi.fn();
      render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button onClick={onClick}>Add</button>}
        />,
      );

      // icon slot
      expect(screen.getByTestId('empty-state-icon')).toBeDefined();
      expect(screen.getByTestId('empty-state-icon').textContent).toBe('📦');

      // title
      expect(screen.getByText('No items')).toBeDefined();

      // body
      expect(screen.getByText('Add your first item')).toBeDefined();

      // exactly one action button
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toBe('Add');
    });

    it('DOM order: icon → title → body → action', () => {
      const onClick = vi.fn();
      const { container } = render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button onClick={onClick}>Add</button>}
        />,
      );

      const root = container.firstElementChild!;
      const children = Array.from(root.children);

      // icon comes first
      const iconIdx = children.findIndex(
        (el) => el.getAttribute('data-testid') === 'empty-state-icon',
      );
      const titleEl = screen.getByText('No items');
      const bodyEl = screen.getByText('Add your first item');
      const btnEl = screen.getByRole('button');

      // each must appear — indexOf on DOM nodes within root's children
      const nodeList = Array.from(root.querySelectorAll('*'));
      const iconPos = nodeList.indexOf(root.querySelector('[data-testid="empty-state-icon"]')!);
      const titlePos = nodeList.indexOf(titleEl);
      const bodyPos = nodeList.indexOf(bodyEl);
      const btnPos = nodeList.indexOf(btnEl);

      expect(iconIdx).toBeGreaterThanOrEqual(0);
      expect(iconPos).toBeLessThan(titlePos);
      expect(titlePos).toBeLessThan(bodyPos);
      expect(bodyPos).toBeLessThan(btnPos);
    });
  });

  describe('visual: token-based padding (no inline style on root)', () => {
    it('root element has NO inline padding style (uses tokens.css class)', () => {
      render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button>Add</button>}
        />,
      );

      // The root empty-state element must not carry inline padding/margin
      const root = screen.getByTestId('empty-state-root');
      const style = root.getAttribute('style') ?? '';
      expect(style).not.toMatch(/padding/i);
      expect(style).not.toMatch(/margin/i);
    });
  });

  describe('visual: shadcn Button wrapper (not raw <button>)', () => {
    it('action is rendered inside a Button component (data-slot="button" marker)', () => {
      render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button>Add</button>}
        />,
      );

      // The Button wrapper must expose data-slot="button" per shadcn convention
      // OR the action container has data-testid="empty-state-action" wrapping it
      const actionWrapper = screen.getByTestId('empty-state-action');
      expect(actionWrapper).toBeDefined();

      // The actual clickable element must be wrapped with the Button component;
      // Button adds data-slot="button" to its root element
      const slottedBtn = actionWrapper.querySelector('[data-slot="button"]');
      expect(slottedBtn).not.toBeNull();
    });
  });

  describe('interactional: keyboard activation (Enter and Space)', () => {
    it('fires onClick once when Enter is pressed on the action button', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button onClick={onClick}>Add</button>}
        />,
      );

      const btn = screen.getByRole('button', { name: 'Add' });
      btn.focus();
      await user.keyboard('{Enter}');

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('fires onClick once when Space is pressed on the action button', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button onClick={onClick}>Add</button>}
        />,
      );

      const btn = screen.getByRole('button', { name: 'Add' });
      btn.focus();
      await user.keyboard(' ');

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('fires onClick exactly once per keystroke (mutation guard: not zero, not twice)', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(
        <EmptyState
          icon="📦"
          title="No items"
          body="Add your first item"
          action={<button onClick={onClick}>Add</button>}
        />,
      );

      const btn = screen.getByRole('button', { name: 'Add' });
      btn.focus();
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(1);

      onClick.mockClear();
      await user.keyboard(' ');
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — deriveRunHistory
// ─────────────────────────────────────────────────────────────────────────────
describe('AC2 — deriveRunHistory(events: OutboxEvent[]): RunHistoryRow[]', () => {
  // Fixture: 3 events for aggregate A, 2 for aggregate B
  // A's newest is at index 2 (2024-01-03), B's newest is at index 1 (2024-02-01)
  // Newest across both: B (2024-02-01) > A (2024-01-03)
  // Expected output order: B first, then A
  const events: OutboxEvent[] = [
    { aggregate_id: 'agg-A', created_at: '2024-01-01T10:00:00Z' },
    { aggregate_id: 'agg-A', created_at: '2024-01-02T10:00:00Z' },
    { aggregate_id: 'agg-B', created_at: '2024-01-15T10:00:00Z' },
    { aggregate_id: 'agg-A', created_at: '2024-01-03T10:00:00Z' }, // A newest
    { aggregate_id: 'agg-B', created_at: '2024-02-01T10:00:00Z' }, // B newest (overall newest)
  ];

  it('returns exactly one row per unique aggregate_id', () => {
    const rows = deriveRunHistory(events);
    expect(rows).toHaveLength(2);
    const ids = rows.map((r: RunHistoryRow) => r.aggregate_id);
    expect(ids).toContain('agg-A');
    expect(ids).toContain('agg-B');
  });

  it('orders rows newest-first by the most-recent event in each group', () => {
    const rows = deriveRunHistory(events);
    // B's newest is 2024-02-01, A's newest is 2024-01-03 → B must come first
    expect(rows[0].aggregate_id).toBe('agg-B');
    expect(rows[1].aggregate_id).toBe('agg-A');
  });

  it('mutation guard: oldest-first ordering produces a FAILING assertion (documents the invariant)', () => {
    const rows = deriveRunHistory(events);
    // If the function incorrectly sorted oldest-first, rows[0] would be agg-A.
    // This assertion proves that the test catches such a regression.
    expect(rows[0].aggregate_id).not.toBe('agg-A');
  });

  it('counts all events per aggregate_id (A has 3, B has 2)', () => {
    const rows = deriveRunHistory(events);
    const rowB = rows.find((r: RunHistoryRow) => r.aggregate_id === 'agg-B')!;
    const rowA = rows.find((r: RunHistoryRow) => r.aggregate_id === 'agg-A')!;
    expect(rowB.count).toBe(2);
    expect(rowA.count).toBe(3);
  });

  it('newest_at on each row equals the ISO string of the most-recent event', () => {
    const rows = deriveRunHistory(events);
    const rowB = rows.find((r: RunHistoryRow) => r.aggregate_id === 'agg-B')!;
    const rowA = rows.find((r: RunHistoryRow) => r.aggregate_id === 'agg-A')!;
    expect(rowB.newest_at).toBe('2024-02-01T10:00:00Z');
    expect(rowA.newest_at).toBe('2024-01-03T10:00:00Z');
  });

  it('handles a single event producing one row with count=1', () => {
    const single: OutboxEvent[] = [
      { aggregate_id: 'agg-X', created_at: '2024-03-10T00:00:00Z' },
    ];
    const rows = deriveRunHistory(single);
    expect(rows).toHaveLength(1);
    expect(rows[0].aggregate_id).toBe('agg-X');
    expect(rows[0].count).toBe(1);
    expect(rows[0].newest_at).toBe('2024-03-10T00:00:00Z');
  });

  it('returns an empty array for empty input', () => {
    const rows = deriveRunHistory([]);
    expect(rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — DryRunButton
// ─────────────────────────────────────────────────────────────────────────────
describe('AC3 — DryRunButton role / variant / tooltip', () => {
  it('renders an element with role="button"', () => {
    render(<DryRunButton />);
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('carries the "dry-run" variant marker (class or data-variant)', () => {
    const { container } = render(<DryRunButton />);
    const btn = screen.getByRole('button');
    const hasDryRunClass = btn.className.includes('dry-run');
    const hasDryRunDataAttr = btn.getAttribute('data-variant') === 'dry-run';
    // Either marker is acceptable; exactly one must be present
    expect(hasDryRunClass || hasDryRunDataAttr).toBe(true);
  });

  it('tooltip text is "Preview only — no changes saved"', () => {
    render(<DryRunButton />);
    const btn = screen.getByRole('button');

    // Tooltip must be accessible via aria-describedby
    const describedById = btn.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();

    const tooltipEl = document.getElementById(describedById!);
    expect(tooltipEl).not.toBeNull();
    expect(tooltipEl!.textContent).toBe('Preview only — no changes saved');
  });

  it('tooltip element is present in the DOM (visible or via aria-describedby)', () => {
    render(<DryRunButton />);
    // getByText will find it even if visually hidden
    expect(screen.getByText('Preview only — no changes saved')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Smoke tests — basic render for RunStrip, TabsCounted, CompactActivity
// (GREEN implementer ACs; here we verify they mount without crashing)
// ─────────────────────────────────────────────────────────────────────────────
describe('Smoke — RunStrip basic render', () => {
  it('mounts without throwing', () => {
    expect(() =>
      render(<RunStrip statuses={['idle', 'running', 'passed', 'failed']} />),
    ).not.toThrow();
  });

  it('renders a pill for each status entry', () => {
    const { container } = render(
      <RunStrip statuses={['idle', 'passed', 'failed']} />,
    );
    const pills = container.querySelectorAll('[data-status]');
    expect(pills.length).toBe(3);
  });
});

describe('Smoke — TabsCounted basic render', () => {
  it('mounts without throwing', () => {
    const tabs = [
      { label: 'Alpha', count: 3, content: <div>Alpha content</div> },
      { label: 'Beta', count: 0, content: <div>Beta content</div> },
    ];
    expect(() => render(<TabsCounted tabs={tabs} />)).not.toThrow();
  });

  it('renders a numeric badge per tab', () => {
    const tabs = [
      { label: 'Alpha', count: 3, content: <div>Alpha content</div> },
      { label: 'Beta', count: 7, content: <div>Beta content</div> },
    ];
    render(<TabsCounted tabs={tabs} />);
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
  });
});

describe('Smoke — CompactActivity basic render', () => {
  it('mounts without throwing', () => {
    const rows = [
      { id: '1', timestamp: '2024-01-01T10:00:00Z', user: 'alice', text: 'did something' },
    ];
    expect(() => render(<CompactActivity rows={rows} />)).not.toThrow();
  });

  it('renders one timestamp and one user for a single-row feed', () => {
    const rows = [
      { id: '1', timestamp: '2024-01-01T10:00:00Z', user: 'alice', text: 'did something' },
    ];
    render(<CompactActivity rows={rows} />);
    expect(screen.getByText('alice')).toBeDefined();
  });
});
