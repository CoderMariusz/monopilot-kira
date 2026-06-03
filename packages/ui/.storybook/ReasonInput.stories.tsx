/**
 * T-028 / T-067 — ReasonInput stories
 * Story group: 'ReasonInput/min-10-default'
 *
 * Prototype source:
 *   prototypes/design/Monopilot Design System/settings/modals.jsx:72-108  (FlagEditModal)
 *   prototypes/design/Monopilot Design System/_shared/modals.jsx:73-85     (ReasonInput def)
 *
 * Covers the relevant states:
 *   1. idle (0 chars, submit disabled, counter 0/10+)
 *   2. typing — below min
 *   3. met-min (exactly 10 chars)
 *   4. exceeded (>10 chars)
 *   5. aria-label-only (no visible label — label supplied by external wrap)
 *   + visible-label variant (T-067)
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import ReasonInput from '../src/ReasonInput';

const meta: Meta<typeof ReasonInput> = {
  title: 'ReasonInput/min-10-default',
  component: ReasonInput,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480, padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ReasonInput>;

// ── Idle (0 chars) — submit disabled, counter 0/10+ ─────────────────────────────
export const Idle: Story = {
  render: () => (
    <div>
      <ReasonInput name="reason" minLength={10} aria-label="Audit reason" placeholder="Why is this changing? (audit-logged)" />
      <button type="submit">Save change</button>
    </div>
  ),
};

// ── Typing (below min) — type <10 chars to see the disabled state ────────────────
export const Typing: Story = {
  render: () => (
    <div>
      <p>Type fewer than 10 characters to see the below-min (disabled) state.</p>
      <ReasonInput name="reason" minLength={10} aria-label="Audit reason" placeholder="Why is this changing? (audit-logged)" />
      <button type="submit">Save change</button>
    </div>
  ),
};

// ── Met min (exactly 10 chars) — submit enabled, counter 10/10+ ──────────────────
export const MetMin: Story = {
  render: () => (
    <div>
      <p>Type exactly 10 characters to see the enabled state.</p>
      <ReasonInput name="reason" minLength={10} aria-label="Audit reason" placeholder="Why is this changing? (audit-logged)" />
      <button type="submit">Save change</button>
    </div>
  ),
};

// ── Exceeded (>10 chars) — submit enabled, counter exceeds min ───────────────────
export const Exceeded: Story = {
  render: () => (
    <div>
      <p>Type more than 10 characters; the counter exceeds the minimum.</p>
      <ReasonInput name="reason" minLength={10} aria-label="Audit reason" placeholder="Why is this changing? (audit-logged)" />
      <button type="submit">Save change</button>
    </div>
  ),
};

// ── aria-label only (T-067) — accessible name supplied externally, no visible label
export const AriaLabelOnly: Story = {
  render: () => (
    <div>
      <p>No visible label; the textarea is named via the aria-label prop.</p>
      <ReasonInput name="reason" minLength={10} aria-label="Audit reason" placeholder="Why is this changing? (audit-logged)" />
      <button type="submit">Save change</button>
    </div>
  ),
};

// ── visible label (T-067) — renders a wired <label> above the textarea ───────────
export const WithVisibleLabel: Story = {
  render: () => (
    <div>
      <ReasonInput name="reason" minLength={10} label="Audit reason" placeholder="Why is this changing? (audit-logged)" />
      <button type="submit">Save change</button>
    </div>
  ),
};
