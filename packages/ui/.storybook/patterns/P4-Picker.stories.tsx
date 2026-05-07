/**
 * P4-Picker — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal + searchable list (mock data).
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState, useMemo } from 'react';
import Modal from '../../src/Modal';

const ITEMS = [
  { id: 'site-1', name: 'Apex Site Alpha' },
  { id: 'site-2', name: 'Apex Site Beta' },
  { id: 'site-3', name: 'Apex Site Gamma' },
  { id: 'site-4', name: 'Monopilot HQ' },
  { id: 'site-5', name: 'Northern Depot' },
];

function P4PickerImpl() {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(
    () => ITEMS.filter((it) => it.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const searchId = 'p4-picker-search';

  return (
    <Modal open={open} onOpenChange={setOpen} size="md">
      <Modal.Header title="Pick a site" />
      <Modal.Body>
        <label htmlFor={searchId}>Search sites</label>
        <input
          id={searchId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to filter…"
        />
        <ul role="listbox" aria-label="Available sites" data-testid="picker-list">
          {filtered.map((it) => (
            <li
              key={it.id}
              role="option"
              aria-selected={selected === it.id}
              onClick={() => setSelected(it.id)}
              style={{ cursor: 'pointer', padding: '4px 8px' }}
            >
              {it.name}
            </li>
          ))}
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={!selected ? 'true' : undefined}
          onClick={() => setOpen(false)}
        >
          Select
        </button>
      </Modal.Footer>
    </Modal>
  );
}

const meta: Meta = { title: 'Patterns/P4-Picker' };
export default meta;

export const Default: StoryObj = {
  render: () => <P4PickerImpl />,
};
