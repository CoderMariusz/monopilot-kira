/**
 * PF-R06-08 — client copy must distinguish draft fork vs released fork (in_review).
 * Reads locale bundles directly; no component render (bom-edit-dialog is off-limits).
 */
import { describe, expect, it } from 'vitest';

// 8 levels up: __tests__ → _lib → bom → technical → (modules) → (app) → [locale] →
// app → apps/web. With 7 this resolved to apps/web/app/i18n, which does not exist,
// so the suite failed to load and asserted nothing.
import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

const editCopy = (bundle: typeof en) => bundle.technical.bom.edit;

describe('BOM lifecycle copy — released vs draft fork (PF-R06-08)', () => {
  it('newDraftNotice (released clone-on-write) promises in_review, not a new draft', () => {
    const msg = editCopy(en).newDraftNotice;
    expect(msg).toMatch(/in review/i);
    expect(msg).not.toMatch(/new draft version/i);
  });

  it('newEditableDraftNotice (draft save path) promises a new draft, not in_review', () => {
    const msg = editCopy(en).newEditableDraftNotice;
    expect(msg).toMatch(/draft version/i);
    expect(msg).not.toMatch(/in review/i);
  });

  it('pl newDraftNotice matches the in_review contract', () => {
    const msg = editCopy(pl).newDraftNotice;
    expect(msg).toMatch(/przegląd|in review/i);
    expect(msg).not.toMatch(/wersję roboczą/i);
  });

  it('pl newEditableDraftNotice matches the draft fork contract', () => {
    const msg = editCopy(pl).newEditableDraftNotice;
    expect(msg).toMatch(/wersję roboczą/i);
    expect(msg).not.toMatch(/przegląd|in review/i);
  });
});
