/**
 * B-2 — Dual-sign panel RTL: prototype parity (other-screens.jsx:364-385 dual
 * sign-off slots + modals.jsx:315-336 sign gate) + sign flows + slot-aware error
 * mapping + i18n (en resolves every key).
 *
 * The panel is a presentational client island; signChangeover is injected as a
 * vi.fn() stub so we assert the EXACT payload and the mapped error copy.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../../../i18n/en.json';
import { ChangeoverSignPanel } from '../_components/changeover-sign-panel.client';
import { buildChangeoversLabels } from '../_components/build-labels';
import type { ChangeoverListRow, SignChangeoverError } from '../_components/changeovers-contract';

const enCo = (enMessages as Record<string, any>).production.changeovers;
const t = (key: string): string => {
  const parts = key.split('.');
  let node: any = enCo;
  for (const p of parts) node = node?.[p];
  if (typeof node !== 'string') throw new Error(`MISSING en key production.changeovers.${key}`);
  return node;
};
const labels = buildChangeoversLabels(t).sign;

function rowWith(overrides: Partial<ChangeoverListRow>): ChangeoverListRow {
  return {
    id: 'co-1',
    lineId: 'line-1',
    lineCode: 'LINE-04',
    toProduct: { id: 'p2', code: 'FG5302', name: 'Pierogi z grzybami' },
    fromProduct: { id: 'p1', code: 'FG5301', name: 'Pierogi z mięsem' },
    allergenRisk: 'medium',
    cleaningCompleted: true,
    dualSignOffStatus: 'pending',
    createdAt: '2026-04-20T08:00:00.000Z',
    ...overrides,
  };
}

describe('ChangeoverSignPanel — i18n (parity guard)', () => {
  it('resolves every staged en key (no leaked dotted key)', () => {
    const flat: string[] = [];
    const walk = (o: any) => {
      for (const v of Object.values(o)) {
        if (typeof v === 'string') flat.push(v);
        else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(labels);
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.some((s) => /^[a-z]+\.[a-z]/i.test(s) && !s.includes(' '))).toBe(false);
  });
});

describe('ChangeoverSignPanel — slots + sign flow', () => {
  it('pending: shows two empty slots + only the 1st-signature button', () => {
    render(
      <ChangeoverSignPanel row={rowWith({ dualSignOffStatus: 'pending' })} labels={labels} signChangeoverAction={vi.fn()} />,
    );
    expect(screen.getAllByTestId('changeover-sign-slot')).toHaveLength(2);
    expect(screen.getByTestId('changeover-sign-first-co-1')).toBeInTheDocument();
    expect(screen.queryByTestId('changeover-sign-second-co-1')).not.toBeInTheDocument();
  });

  it('first_signed: shows the 1st signer + the 2nd-signature button', () => {
    render(
      <ChangeoverSignPanel
        row={rowWith({
          dualSignOffStatus: 'first_signed',
          firstSigner: { id: 'u1', name: 'M. Szymczak', email: 'm@x.io', signedAt: '2026-04-20T08:24:00.000Z' },
        })}
        labels={labels}
        signChangeoverAction={vi.fn()}
      />,
    );
    expect(screen.getByText('M. Szymczak')).toBeInTheDocument();
    expect(screen.getByTestId('changeover-sign-second-co-1')).toBeInTheDocument();
    expect(screen.queryByTestId('changeover-sign-first-co-1')).not.toBeInTheDocument();
  });

  it('complete: shows the green complete banner + no sign buttons', () => {
    render(
      <ChangeoverSignPanel
        row={rowWith({
          dualSignOffStatus: 'complete',
          firstSigner: { id: 'u1', name: 'M. Szymczak', email: 'm@x.io', signedAt: '2026-04-20T08:24:00.000Z' },
          secondSigner: { id: 'u2', name: 'J. Adamczyk', email: 'j@x.io', signedAt: '2026-04-20T08:31:00.000Z' },
        })}
        labels={labels}
        signChangeoverAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('changeover-sign-complete-co-1')).toHaveTextContent(labels.completeBanner);
    expect(screen.queryByTestId('changeover-sign-first-co-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('changeover-sign-second-co-1')).not.toBeInTheDocument();
  });

  it('opens the e-sign modal, submits the password, and calls onSigned on success', async () => {
    const sign = vi.fn().mockResolvedValue({ ok: true });
    const onSigned = vi.fn();
    render(
      <ChangeoverSignPanel row={rowWith({ dualSignOffStatus: 'pending' })} labels={labels} signChangeoverAction={sign} onSigned={onSigned} />,
    );
    fireEvent.click(screen.getByTestId('changeover-sign-first-co-1'));
    const pwd = await screen.findByTestId('changeover-sign-password');
    fireEvent.change(pwd, { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByTestId('changeover-sign-submit'));
    await waitFor(() => expect(sign).toHaveBeenCalledWith({ changeoverId: 'co-1', signature: { password: 'secret-pass' } }));
    await waitFor(() => expect(onSigned).toHaveBeenCalled());
  });

  it('submit stays disabled with an empty password (no call)', async () => {
    const sign = vi.fn();
    render(<ChangeoverSignPanel row={rowWith({ dualSignOffStatus: 'pending' })} labels={labels} signChangeoverAction={sign} />);
    fireEvent.click(screen.getByTestId('changeover-sign-first-co-1'));
    const submit = await screen.findByTestId('changeover-sign-submit');
    expect(submit).toBeDisabled();
    expect(sign).not.toHaveBeenCalled();
  });
});

describe('ChangeoverSignPanel — slot-aware error mapping', () => {
  const cases: Array<[SignChangeoverError, string]> = [
    ['wrong_role', labels.errors.wrong_role],
    ['same_user', labels.errors.same_user],
    ['invalid_state', labels.errors.invalid_state],
    ['esign_failed', labels.errors.esign_failed],
  ];

  it.each(cases)('maps %s to the right copy', async (code, copy) => {
    const sign = vi.fn().mockResolvedValue({ ok: false, error: code });
    render(<ChangeoverSignPanel row={rowWith({ dualSignOffStatus: 'pending' })} labels={labels} signChangeoverAction={sign} />);
    fireEvent.click(screen.getByTestId('changeover-sign-first-co-1'));
    fireEvent.change(await screen.findByTestId('changeover-sign-password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByTestId('changeover-sign-submit'));
    const err = await screen.findByTestId('changeover-sign-error');
    expect(err).toHaveTextContent(copy);
  });

  it('wrong_role copy is exactly the contract-specified message', () => {
    expect(labels.errors.wrong_role).toBe('Your role is not authorized for this signature slot');
    expect(labels.errors.same_user).toBe('Second signature must be a different user');
  });
});
