/**
 * R02-06 — the modal must never render a schema rejection as "This field is
 * required." on a form the user already filled in.
 *
 * `.test.tsx` (not `.test.ts`): `modal-utils` imports the lines screen for its
 * default labels, so this suite needs the JSX-transforming vitest config.
 */
import { describe, expect, it } from 'vitest';

import { mapError } from './modal-utils';
import { DEFAULT_SITES_MODAL_LABELS as LABELS } from '../sites-screen.client';

describe('mapError', () => {
  it('never renders invalid_input as the missing-field label', () => {
    expect(mapError('invalid_input', LABELS)).not.toBe(LABELS.errorRequired);
    expect(mapError('invalid_input', LABELS)).toBe(LABELS.errorGeneric);
  });

  it('prefers the reason the server gave over any generic label', () => {
    const message = 'Timezone: not a valid IANA time zone name (for example Europe/Warsaw or UTC).';

    expect(mapError('invalid_input', LABELS, message)).toBe(message);
    expect(mapError('persistence_failed', LABELS, message)).toBe(message);
  });

  it('reports a duplicate as a duplicate', () => {
    expect(mapError('duplicate_code', LABELS)).toBe(LABELS.errorDuplicate);
    expect(mapError('duplicate_code', LABELS)).not.toBe(LABELS.errorRequired);

    // A site-code duplicate is org-scoped, so the server sends its own wording.
    const orgScoped = 'That site code is already in use in this organisation. Choose a different one.';
    expect(mapError('duplicate_code', LABELS, orgScoped)).toBe(orgScoped);
  });

  it('maps the remaining known errors to their labels', () => {
    expect(mapError('warehouse_site_mismatch', LABELS)).toBe(LABELS.errorWarehouseSiteMismatch);
    expect(mapError('forbidden', LABELS)).toBe(LABELS.errorForbidden);
    expect(mapError('persistence_failed', LABELS)).toBe(LABELS.errorGeneric);
  });
});
