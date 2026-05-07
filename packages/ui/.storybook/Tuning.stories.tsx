import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '../src/Button';
import { EmptyState } from '../src/EmptyState';
import { DryRunButton } from '../src/DryRunButton';
import { RunStrip } from '../src/RunStrip';
import { TabsCounted } from '../src/TabsCounted';
import { CompactActivity } from '../src/CompactActivity';

// ── Button ────────────────────────────────────────────────────────────────────

const buttonMeta: Meta<typeof Button> = {
  title: 'Tuning/Button',
  component: Button,
};
export default buttonMeta;

export const Default: StoryObj<typeof Button> = {
  render: () => <Button>Click me</Button>,
};

export const DryRunVariant: StoryObj<typeof Button> = {
  render: () => <Button variant="dry-run">Dry Run</Button>,
};

// ── EmptyState ────────────────────────────────────────────────────────────────

export const EmptyStateStory: StoryObj = {
  name: 'EmptyState',
  render: () => (
    <EmptyState
      icon="📦"
      title="No items yet"
      body="Add your first item to get started."
      action={{ label: '+ Add item', onClick: () => alert('add') }}
    />
  ),
};

export const EmptyStateWithElement: StoryObj = {
  name: 'EmptyState — ReactElement action',
  render: () => (
    <EmptyState
      icon="👥"
      title="No users"
      body="Try inviting someone."
      action={<button onClick={() => alert('invite')}>+ Invite user</button>}
    />
  ),
};

// ── DryRunButton ──────────────────────────────────────────────────────────────

export const DryRunButtonStory: StoryObj = {
  name: 'DryRunButton',
  render: () => <DryRunButton>Preview</DryRunButton>,
};

// ── RunStrip ──────────────────────────────────────────────────────────────────

export const RunStripStory: StoryObj = {
  name: 'RunStrip',
  render: () => (
    <RunStrip statuses={['idle', 'running', 'passed', 'failed']} />
  ),
};

// ── TabsCounted ───────────────────────────────────────────────────────────────

export const TabsCountedStory: StoryObj = {
  name: 'TabsCounted',
  render: () => (
    <TabsCounted
      tabs={[
        { label: 'Pending', count: 5, content: <div>Pending items</div> },
        { label: 'Done', count: 12, content: <div>Done items</div> },
        { label: 'Failed', count: 1, content: <div>Failed items</div> },
      ]}
    />
  ),
};

// ── CompactActivity ───────────────────────────────────────────────────────────

export const CompactActivityStory: StoryObj = {
  name: 'CompactActivity',
  render: () => (
    <CompactActivity
      rows={[
        { id: '1', timestamp: '2024-01-03T10:00:00Z', user: 'alice', text: 'Ran sync job' },
        { id: '2', timestamp: '2024-01-02T08:30:00Z', user: 'bob', text: 'Updated config' },
        { id: '3', timestamp: '2024-01-01T15:00:00Z', user: 'alice', text: 'Initial setup' },
      ]}
    />
  ),
};
