/**
 * T-029 — Summary.stories.tsx
 *
 * Prototype parity: settings/modals.jsx:111-138 (SchemaViewModal key/value block)
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Summary from '../src/Summary';

const meta: Meta<typeof Summary> = {
  title: 'UI/Summary',
  component: Summary,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Summary>;

// ---------------------------------------------------------------------------
// Unchanged baseline — matches schema_view_modal modals.jsx:111-138
// ---------------------------------------------------------------------------
export const UnchangedBaseline: Story = {
  name: 'Unchanged baseline (schema_view_modal parity)',
  args: {
    rows: [
      { label: 'Column code', after: 'col_01', status: 'unchanged' },
      { label: 'Label', after: 'Revenue', status: 'unchanged' },
      { label: 'Table', after: 'fact_sales', status: 'unchanged' },
      { label: 'Data type', after: 'decimal', status: 'unchanged' },
      { label: 'Nullable', after: 'Yes', status: 'unchanged' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Diff variants
// ---------------------------------------------------------------------------
export const Added: Story = {
  name: 'Diff — added row',
  args: {
    rows: [
      { label: 'New column', after: 'net_revenue', status: 'added' },
    ],
  },
};

export const Changed: Story = {
  name: 'Diff — changed row (amber warning border)',
  args: {
    rows: [
      { label: 'Label', before: 'Revenue', after: 'Net Revenue', status: 'changed' },
    ],
  },
};

export const Removed: Story = {
  name: 'Diff — removed row',
  args: {
    rows: [
      { label: 'Deprecated col', after: 'old_col', status: 'removed' },
    ],
  },
};

export const MixedDiff: Story = {
  name: 'Diff — mixed statuses',
  args: {
    rows: [
      { label: 'Column code', after: 'col_01', status: 'unchanged' },
      { label: 'Label', before: 'Revenue', after: 'Net Revenue', status: 'changed' },
      { label: 'New column', after: 'net_revenue', status: 'added' },
      { label: 'Old column', after: 'deprecated_col', status: 'removed' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export const Empty: Story = {
  name: 'Empty — default fallback',
  args: {
    rows: [],
  },
};

export const EmptyCustom: Story = {
  name: 'Empty — custom emptyState prop',
  args: {
    rows: [],
    emptyState: <p style={{ color: '#6b7280' }}>No schema changes detected.</p>,
  },
};
