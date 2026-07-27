/**
 * @vitest-environment jsdom
 * PF-R06-10 — top-level BOM detail mutations gated by version status (not just RBAC).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ locale: 'en' }),
}));

vi.mock('next-intl', () => {
  const labels: Record<string, string> = {
    addComponent: 'Add component',
    saveVersion: 'Save version',
    deleteVersion: 'Delete version',
    addComponentBlockedArchived: 'Cannot add components — archived.',
    addComponentBlockedSuperseded: 'Cannot add components — superseded.',
    saveVersionBlockedArchived: 'Cannot save — archived.',
    saveVersionBlockedSuperseded: 'Cannot save — superseded.',
    saveVersionBlockedEmpty: 'Add at least one component before saving.',
    deleteStatusBlocked: 'Only draft versions can be deleted.',
    approveForbidden: 'forbidden',
    approveError: 'error',
    publishForbidden: 'forbidden',
    publishError: 'error',
    deleteForbidden: 'forbidden',
    deleteSnapshotBlocked: 'snapshots',
    deleteOnlyVersion: 'only',
    deleteError: 'error',
    title: 'title',
    intro: 'intro',
    cancel: 'Cancel',
    warning: 'warning',
    blockedBySnapshots: 'blocked',
    blockedByStatus: 'blocked',
    confirmLabel: 'confirm',
    delete: 'delete',
  };
  const t = (k: string) => labels[k] ?? k;
  t.has = () => false;
  t.raw = (k: string) => labels[k] ?? k;
  return { useTranslations: () => t };
});

vi.mock('../bom-edit-dialog', () => ({
  ComponentAddModal: () => <div data-testid="add-modal-stub" />,
  VersionSaveModal: () => <div data-testid="save-modal-stub" />,
}));

vi.mock('../../_actions/workflow', () => ({
  approveBom: vi.fn(),
  publishBom: vi.fn(),
}));

vi.mock('../../_actions/delete-bom-version', () => ({
  deleteBomVersion: vi.fn(),
}));

import { BomDetailActions } from '../bom-detail-actions';

const baseProps = {
  productId: 'FG-1001',
  productName: 'Kabanosy',
  currentVersion: 3,
  bomHeaderId: 'header-1',
  snapshotCount: 0,
  versionCount: 3,
  lines: [{ componentCode: 'RM-1', quantity: 1, uom: 'kg' }],
  canApprove: false,
  canPublish: false,
};

afterEach(() => cleanup());

function cta(testId: string) {
  return screen.getByTestId(testId);
}

describe('BomDetailActions — status guards (PF-R06-10)', () => {
  it('draft: all three mutation CTAs stay enabled (anti over-blocking)', () => {
    render(<BomDetailActions {...baseProps} status="draft" canCreate />);
    expect(cta('bom-add-component-cta')).toBeEnabled();
    expect(cta('bom-save-version-cta')).toBeEnabled();
    expect(cta('bom-delete-version-cta')).toBeEnabled();
  });

  it('archived: all three CTAs disabled with a localized reason on each', () => {
    render(<BomDetailActions {...baseProps} status="archived" canCreate />);
    const add = cta('bom-add-component-cta');
    const save = cta('bom-save-version-cta');
    const del = cta('bom-delete-version-cta');
    expect(add).toBeDisabled();
    expect(save).toBeDisabled();
    expect(del).toBeDisabled();
    expect(add).toHaveAttribute('title', 'Cannot add components — archived.');
    expect(save).toHaveAttribute('title', 'Cannot save — archived.');
    expect(del).toHaveAttribute('title', 'Only draft versions can be deleted.');
  });

  it('superseded: add and save disabled with superseded reason; delete disabled', () => {
    render(<BomDetailActions {...baseProps} status="superseded" canCreate />);
    expect(cta('bom-add-component-cta')).toBeDisabled();
    expect(cta('bom-save-version-cta')).toBeDisabled();
    expect(cta('bom-delete-version-cta')).toBeDisabled();
    expect(cta('bom-add-component-cta')).toHaveAttribute('title', 'Cannot add components — superseded.');
    expect(cta('bom-save-version-cta')).toHaveAttribute('title', 'Cannot save — superseded.');
  });

  it('active: add and save enabled; delete disabled with status reason', () => {
    render(<BomDetailActions {...baseProps} status="active" canCreate />);
    expect(cta('bom-add-component-cta')).toBeEnabled();
    expect(cta('bom-save-version-cta')).toBeEnabled();
    expect(cta('bom-delete-version-cta')).toBeDisabled();
    expect(cta('bom-delete-version-cta')).toHaveAttribute('title', 'Only draft versions can be deleted.');
  });

  it('in_review: add and save enabled; delete disabled', () => {
    render(<BomDetailActions {...baseProps} status="in_review" canCreate />);
    expect(cta('bom-add-component-cta')).toBeEnabled();
    expect(cta('bom-save-version-cta')).toBeEnabled();
    expect(cta('bom-delete-version-cta')).toBeDisabled();
  });

  // ── [B-6] Delete only when deleteBomVersion would actually accept it ──────────
  it('draft that is the ONLY version: delete disabled with the only-version reason', () => {
    render(<BomDetailActions {...baseProps} versionCount={1} status="draft" canCreate />);
    const del = cta('bom-delete-version-cta');
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('title', 'only');
    // The other two CTAs must NOT be dragged down with it.
    expect(cta('bom-add-component-cta')).toBeEnabled();
    expect(cta('bom-save-version-cta')).toBeEnabled();
  });

  it('draft referenced by a WO snapshot: delete disabled with the snapshot reason', () => {
    render(<BomDetailActions {...baseProps} snapshotCount={2} status="draft" canCreate />);
    const del = cta('bom-delete-version-cta');
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('title', 'snapshots');
    expect(cta('bom-add-component-cta')).toBeEnabled();
    expect(cta('bom-save-version-cta')).toBeEnabled();
  });

  it('a blocked draft delete never claims the status is the problem', () => {
    render(<BomDetailActions {...baseProps} versionCount={1} status="draft" canCreate />);
    expect(cta('bom-delete-version-cta')).not.toHaveAttribute('title', 'Only draft versions can be deleted.');
  });
});
