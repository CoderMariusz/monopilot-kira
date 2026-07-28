/**
 * @vitest-environment jsdom
 *
 * FALA 6 / T2 — R02-03: the Add/Edit Location dialog must not let a child claim to be active
 * while its parent is inactive, and must stay usable on rows that already violate that rule.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocationTreeScreen } from '../location-tree-client';
import type { LocationTreeLabels } from '../location-tree-client';
import type { LocationRow, UpsertLocationResult } from '../location-types';

const WAREHOUSE_ID = 'wh-1';

const ZONE: LocationRow = { id: 'zone-1', warehouseId: WAREHOUSE_ID, parentId: null, code: 'R02-ZONE', name: 'Zone', level: 1, path: 'R02-ZONE', isActive: true };
const BIN1: LocationRow = { id: 'bin-1', warehouseId: WAREHOUSE_ID, parentId: 'zone-1', code: 'R02-BIN1', name: 'Bin 1', level: 2, path: 'R02-ZONE.R02-BIN1', isActive: false };
// Pre-existing non-compliant row: active child of an inactive parent, legal before this change.
const SUB1: LocationRow = { id: 'sub-1', warehouseId: WAREHOUSE_ID, parentId: 'bin-1', code: 'R02-SUB1', name: 'Sub 1', level: 3, path: 'R02-ZONE.R02-BIN1.R02-SUB1', isActive: true };
// [L-1] The same violation one level up: an active INTERMEDIATE node with an active child.
const L1: LocationRow = { id: 'l1', warehouseId: WAREHOUSE_ID, parentId: null, code: 'R02-L1', name: 'L1', level: 1, path: 'R02-L1', isActive: false };
const L2: LocationRow = { id: 'l2', warehouseId: WAREHOUSE_ID, parentId: 'l1', code: 'R02-L2', name: 'L2', level: 2, path: 'R02-L1.R02-L2', isActive: true };
const L3: LocationRow = { id: 'l3', warehouseId: WAREHOUSE_ID, parentId: 'l2', code: 'R02-L3', name: 'L3', level: 3, path: 'R02-L1.R02-L2.R02-L3', isActive: true };

const LABEL_OVERRIDES: Partial<LocationTreeLabels> = {
  title: 'Locations',
  selectedLocation: 'Selected location',
  addLocation: '+ Add location',
  editLocation: 'Edit',
  addChild: '+ Child',
  deleteLocation: 'Delete',
  dialogAddTitle: 'Add location',
  dialogEditTitle: 'Edit location',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldParent: 'Parent location',
  fieldType: 'Type',
  fieldActive: 'Is active',
  fieldBarcode: 'Barcode',
  warehouse: 'Warehouse',
  createLocation: 'Create location',
  saveChanges: 'Save changes',
  cancel: 'Cancel',
  active: 'Active',
  inactive: 'Inactive',
  warehouseUnassigned: '—',
  parentInactiveHint: 'The parent location is inactive, so this location is saved as inactive.',
  parentInactiveLegacyHint: 'This location stays active although its parent is inactive. Reactivate {parent} to repair the hierarchy.',
  hasActiveChildrenError: 'This location still has active child locations.',
  upsertError: 'Location save failed.',
};

// ponytail: only the strings the assertions read are real; every other label echoes its key name.
const labels = new Proxy(LABEL_OVERRIDES, {
  get: (target, key) => {
    if (typeof key !== 'string') return undefined;
    return key in target ? target[key as keyof LocationTreeLabels] : key;
  },
}) as LocationTreeLabels;

function renderScreen(overrides: Partial<React.ComponentProps<typeof LocationTreeScreen>> = {}) {
  const upsertLocation = vi.fn(
    async (): Promise<UpsertLocationResult> => ({ ok: true, data: { id: 'saved', path: 'R02-ZONE.NEW', level: 2, active: true } }),
  );
  const props: React.ComponentProps<typeof LocationTreeScreen> = {
    labels,
    warehouses: [{ id: WAREHOUSE_ID, code: 'WH1', name: 'Warehouse 1' }],
    locations: [ZONE, BIN1, SUB1],
    selectedWarehouseId: WAREHOUSE_ID,
    selectedLocationId: ZONE.id,
    parentLocationId: null,
    canImport: true,
    canUpdateInfra: true,
    state: 'ready',
    activeDialog: null,
    importCsvAction: vi.fn(async () => {}),
    importWarehouseId: WAREHOUSE_ID,
    importLocale: 'en',
    importToast: null,
    upsertToast: null,
    upsertLocation,
    deleteLocation: vi.fn(async () => ({ ok: true as const, data: { locationId: 'x', warehouseId: WAREHOUSE_ID } })),
    ...overrides,
  };
  return { upsertLocation, ...render(<LocationTreeScreen {...props} />) };
}

const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('R02-03 · Location dialog: activity must agree with the parent', () => {
  it('forces a child of an inactive parent to inactive and says why', async () => {
    const user = userEvent.setup();
    const { upsertLocation } = renderScreen({ selectedLocationId: BIN1.id });

    await user.click(screen.getByRole('button', { name: /\+ child/i }));

    const activeCheckbox = within(dialog()).getByLabelText(/is active/i);
    expect(activeCheckbox).not.toBeChecked();
    expect(activeCheckbox).toBeDisabled();
    expect(screen.getByTestId('location-parent-inactive-hint')).toHaveTextContent(/parent location is inactive/i);

    await user.type(within(dialog()).getByLabelText(/code/i), 'SUB2');
    await user.type(within(dialog()).getByLabelText(/^name$/i), 'Sub 2');
    await user.click(within(dialog()).getByRole('button', { name: /create location/i }));

    await waitFor(() => expect(upsertLocation).toHaveBeenCalledTimes(1));
    expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ parentId: BIN1.id, active: false }));
  });

  it('leaves a child of an ACTIVE parent active and enabled (anti-regression)', async () => {
    const user = userEvent.setup();
    const { upsertLocation } = renderScreen({ selectedLocationId: ZONE.id });

    await user.click(screen.getByRole('button', { name: /\+ child/i }));

    const activeCheckbox = within(dialog()).getByLabelText(/is active/i);
    expect(activeCheckbox).toBeChecked();
    expect(activeCheckbox).toBeEnabled();
    expect(screen.queryByTestId('location-parent-inactive-hint')).not.toBeInTheDocument();

    await user.type(within(dialog()).getByLabelText(/code/i), 'DOCK');
    await user.type(within(dialog()).getByLabelText(/^name$/i), 'Dock');
    await user.click(within(dialog()).getByRole('button', { name: /create location/i }));

    await waitFor(() => expect(upsertLocation).toHaveBeenCalledTimes(1));
    expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ parentId: ZONE.id, active: true }));
  });

  it('does not offer inactive locations as a parent for a new location', async () => {
    const user = userEvent.setup();
    renderScreen({ selectedLocationId: ZONE.id });

    await user.click(screen.getByRole('button', { name: /\+ add location/i }));
    await user.click(within(dialog()).getByRole('combobox', { name: /parent location/i }));

    expect(screen.getByRole('option', { name: 'R02-ZONE' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'R02-ZONE › R02-BIN1 › R02-SUB1' })).toBeInTheDocument();
    // The inactive bin is gone from the picker under either spelling.
    expect(screen.queryByRole('option', { name: 'R02-ZONE › R02-BIN1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'R02-ZONE › R02-BIN1 (Inactive)' })).not.toBeInTheDocument();
  });

  it('keeps a PRE-EXISTING non-compliant row editable, with its inactive parent still shown (anti-over-blocking)', async () => {
    const user = userEvent.setup();
    const { upsertLocation } = renderScreen({ selectedLocationId: SUB1.id });

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    // The row is reachable and saveable — the rule must not strand it.
    const save = within(dialog()).getByRole('button', { name: /save changes/i });
    expect(save).toBeEnabled();
    // Its own parent stays listed even though it is inactive, otherwise the field would show a
    // raw id and a blind save could re-parent the row to root.
    await user.click(within(dialog()).getByRole('combobox', { name: /parent location/i }));
    expect(screen.getByRole('option', { name: 'R02-ZONE › R02-BIN1 (Inactive)' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'R02-ZONE › R02-BIN1 (Inactive)' }));

    await user.clear(within(dialog()).getByLabelText(/^name$/i));
    await user.type(within(dialog()).getByLabelText(/^name$/i), 'Renamed');
    await user.click(within(dialog()).getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(upsertLocation).toHaveBeenCalledTimes(1));
    // [L-1] Renaming is not a request to switch the row off: with the parent link untouched the
    // dialog reports the flag the row actually has, which is what the server preserves.
    expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ id: SUB1.id, parentId: BIN1.id, name: 'Renamed', active: true }));
  });

  // ── [L-1] the case the previous round called "friction" ─────────────────────────────────────
  it('lets an active INTERMEDIATE node under an inactive parent be renamed, and names the repair', async () => {
    const user = userEvent.setup();
    const { upsertLocation } = renderScreen({ locations: [L1, L2, L3], selectedLocationId: L2.id });

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    // The box shows what the row IS — not a false promise that saving will switch it off. That
    // promise is what made the server answer has_active_children and freeze the record.
    const activeCheckbox = within(dialog()).getByLabelText(/is active/i);
    expect(activeCheckbox).toBeChecked();
    expect(activeCheckbox).toBeDisabled();
    expect(screen.getByTestId('location-parent-inactive-legacy-hint')).toHaveTextContent(/reactivate r02-l1 to repair the hierarchy/i);
    expect(screen.queryByTestId('location-parent-inactive-hint')).not.toBeInTheDocument();

    await user.clear(within(dialog()).getByLabelText(/^name$/i));
    await user.type(within(dialog()).getByLabelText(/^name$/i), 'Renamed L2');
    await user.click(within(dialog()).getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(upsertLocation).toHaveBeenCalledTimes(1));
    expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ id: L2.id, parentId: L1.id, name: 'Renamed L2', active: true }));
  });

  // ponytail: no dialog test for "moved under an inactive parent" — the parent picker never
  // offers an inactive location as a NEW target, so that path only exists at the server trust
  // boundary and is pinned there (actions/infra/location-active-parent.test.ts).

  // ── [L-4] ───────────────────────────────────────────────────────────────────────────────────
  it('renders the activity the server PERSISTED, not the one the dialog asked for', async () => {
    const user = userEvent.setup();
    const upsertLocation = vi.fn(
      async (): Promise<UpsertLocationResult> => ({ ok: true, data: { id: ZONE.id, path: ZONE.path, level: ZONE.level, active: false } }),
    );
    renderScreen({ selectedLocationId: ZONE.id, upsertLocation });

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(within(dialog()).getByLabelText(/is active/i)).toBeChecked();
    await user.click(within(dialog()).getByRole('button', { name: /save changes/i }));

    // The dialog asked for active…
    await waitFor(() => expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ id: ZONE.id, active: true })));
    // …the server clamped it, and the screen shows the clamped value instead of the request.
    expect(await screen.findByText(/○ Inactive/)).toBeInTheDocument();
  });

  it('surfaces the named server reason when deactivating a parent that still has active children', async () => {
    const user = userEvent.setup();
    const upsertLocation = vi.fn(async (): Promise<UpsertLocationResult> => ({ ok: false, error: 'has_active_children' }));
    renderScreen({ selectedLocationId: ZONE.id, upsertLocation });

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(within(dialog()).getByLabelText(/is active/i));
    await user.click(within(dialog()).getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(upsertLocation).toHaveBeenCalledWith(expect.objectContaining({ id: ZONE.id, active: false })));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/still has active child locations/i);
  });
});
