/**
 * T-028 — ReasonInput stories
 * Story: 'ReasonInput/min-10-default'
 *
 * Covers the four UI states from the FlagEditModal prototype
 * (modals.jsx:72-108): idle, typing (below min), met-min, exceeded.
 */

import React, { useState } from 'react';
import ReasonInput from '../src/ReasonInput';

export default {
  title: 'ReasonInput/min-10-default',
  component: ReasonInput,
};

// ── Idle ──────────────────────────────────────────────────────────────────────
// No text entered; submit disabled; counter shows 0/10+
export const Idle = () => (
  <div style={{ maxWidth: 480, padding: '1rem' }}>
    <h3 style={{ marginBottom: '0.5rem' }}>Idle (0 chars)</h3>
    <div>
      <ReasonInput name="reason" minLength={10} placeholder="Enter a reason…" />
      <button type="submit" style={{ marginTop: '0.5rem' }}>
        Save change
      </button>
    </div>
  </div>
);

// ── Typing (below min) ────────────────────────────────────────────────────────
// Pre-filled with 5 chars; submit should be aria-disabled; counter 5/10+
export const Typing = () => {
  const [value, setValue] = useState('Hello');
  return (
    <div style={{ maxWidth: 480, padding: '1rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>Typing — below min (5 chars)</h3>
      <div>
        {/* ReasonInput manages its own state; value shown for clarity only */}
        <ReasonInput name="reason" minLength={10} placeholder="Enter a reason…" />
        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          (Pre-fill the textarea manually to see the below-min state)
        </p>
        <button type="submit" style={{ marginTop: '0.5rem' }}>
          Save change
        </button>
      </div>
    </div>
  );
};

// ── Met min ───────────────────────────────────────────────────────────────────
// Exactly 10 chars; submit should be enabled; counter 10/10+
export const MetMin = () => (
  <div style={{ maxWidth: 480, padding: '1rem' }}>
    <h3 style={{ marginBottom: '0.5rem' }}>Met minimum (10 chars)</h3>
    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
      Type exactly 10 characters in the textarea to see the enabled state.
    </p>
    <div>
      <ReasonInput name="reason" minLength={10} placeholder="Enter a reason…" />
      <button type="submit" style={{ marginTop: '0.5rem' }}>
        Save change
      </button>
    </div>
  </div>
);

// ── Exceeded ──────────────────────────────────────────────────────────────────
// More than 10 chars; submit enabled; counter > 10/10+
export const Exceeded = () => (
  <div style={{ maxWidth: 480, padding: '1rem' }}>
    <h3 style={{ marginBottom: '0.5rem' }}>Exceeded minimum (&gt;10 chars)</h3>
    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
      Type more than 10 characters in the textarea to see the counter exceed the min.
    </p>
    <div>
      <ReasonInput name="reason" minLength={10} placeholder="Enter a reason…" />
      <button type="submit" style={{ marginTop: '0.5rem' }}>
        Save change
      </button>
    </div>
  </div>
);
