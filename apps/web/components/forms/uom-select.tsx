'use client';

/**
 * Shared UoM dropdown.
 *
 * Owner's rule: NO free-text unit fields anywhere — every UoM input must be a
 * constrained dropdown (the shared @monopilot/ui Select) so nobody can type a
 * bogus unit like "eac" again. This wraps that Select with the canonical UoM
 * option list and forwards localized labels from the host page (no hardcoded,
 * English-only unit strings — `labels` is passed in and threaded through the
 * page's existing label object, i18n-staging/uom-sweep.json).
 *
 * Canonical units (`UOM_VALUES`): kg, g, l, ml, pcs, pack, box, pallet. Callers
 * pass the subset that makes sense for their context via `units`; purchasing /
 * transfer line editors use the full list.
 *
 * Default-to-item-uom: when a row's item picker supplies the item's base UoM,
 * the caller preselects it (`value`) while keeping it changeable. If the
 * preselected value is not one of the offered `units` (e.g. a legacy free-text
 * unit on an existing item), it is surfaced as an extra option so the dropdown
 * still reflects the stored value rather than silently dropping it.
 */

import React from 'react';

import { Select, type SelectOption } from '@monopilot/ui/Select';

/** Canonical UoM identifiers (stable values sent to the server). */
export const UOM_VALUES = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'pallet'] as const;
export type UomValue = (typeof UOM_VALUES)[number];

/** Full ordered list used by purchasing / transfer line editors. */
export const PURCHASING_UOMS: UomValue[] = [...UOM_VALUES];

export type UomSelectProps = {
  /** Currently selected unit (e.g. the row item's uomBase). May be ''. */
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Localized display labels keyed by canonical value (kg/g/l/ml/pcs/pack/box/
   * pallet). Threaded from the host page's label object — never hardcoded here.
   */
  labels: Partial<Record<UomValue, string>> & Record<string, string | undefined>;
  /** Placeholder when nothing is selected (localized). */
  placeholder?: string;
  /** Subset of canonical units to offer; defaults to the full list. */
  units?: readonly UomValue[];
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  id?: string;
};

export function UomSelect({
  value,
  onValueChange,
  labels,
  placeholder,
  units = UOM_VALUES,
  disabled,
  className,
  id,
  ...aria
}: UomSelectProps) {
  const options = React.useMemo<SelectOption[]>(() => {
    const base = units.map((u) => ({ value: u, label: labels[u] ?? u }));
    // Preserve a stored value that is not part of the offered set (legacy
    // free-text unit on an existing item) so the dropdown still shows it.
    if (value && !units.includes(value as UomValue)) {
      return [{ value, label: labels[value] ?? value }, ...base];
    }
    return base;
  }, [units, labels, value]);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      id={id}
      aria-label={aria['aria-label']}
    />
  );
}

export default UomSelect;
