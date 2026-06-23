'use client';

/**
 * QA-003b — Specification detail (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   specs-screens.jsx:304-418 (QaSpecDetail):
 *     breadcrumb + title + status badge + back link       → specs-screens.jsx:312-320
 *     signed/immutable banner (21 CFR Part 11)            → specs-screens.jsx:328-333
 *     header card (product / spec code / version /
 *       applies-to / approved by/at)                       → specs-screens.jsx:337-347
 *     parameters table with critical badges               → specs-screens.jsx:365-384
 *     Approve action when under_review (MODAL-SPEC-SIGN)   → specs-screens.jsx:324
 *     signature sidebar (signed meaning / not yet signed)  → specs-screens.jsx:396-408
 *
 * Status banner per state (task contract): draft = editable hint; under_review =
 * locked + Approve; active = signed/immutable banner; superseded = dimmed +
 * immutable note; expired = expired note.
 *
 * Actions (server-gated; the buttons are affordances only — each action re-checks
 * the grant authoritatively):
 *   - Submit for review (draft)  → submitSpecForReview
 *   - Approve (under_review)     → MODAL-SPEC-SIGN → approveSpec (password e-sign,
 *                                  verbatim esign failures)
 *   - Supersede (active)         → pick a NEWER version of the same product + spec
 *                                  code (supersedeCandidates, listSpecs filtered
 *                                  server/parent-side); disabled with an honest
 *                                  title when none.
 *
 * DEVIATIONS (documented): the prototype's "Clone to new version" / "Download PDF"
 * header buttons + the allergen-profile snapshot card + the Notes/Reference-docs
 * fields (specs-screens.jsx:322-323,349-363,386-391) are OUT OF SCOPE for the
 * getSpecDetail contract. Numeric parameter values are rendered as the DECIMAL
 * STRINGS returned by the action (never re-parsed to float).
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { SpecSignModal, type SpecSignLabels } from './spec-sign-modal.client';
import type {
  ApproveSpecFn,
  SpecDetail,
  SpecStatus,
  SubmitSpecForReviewFn,
  SupersedeSpecFn,
} from '../../_components/spec-actions-contract';

const STATUS_VARIANT: Record<SpecStatus, BadgeVariant> = {
  draft: 'muted',
  under_review: 'warning',
  active: 'success',
  expired: 'danger',
  superseded: 'muted',
};

/** Newer-version candidate for supersede (same product + spec code, higher version). */
export type SupersedeCandidate = { id: string; version: number };

export type SpecDetailLabels = {
  backToSpecs: string;
  banner: {
    draft: string;
    under_review: string;
    active: string;
    superseded: string;
    expired: string;
  };
  header: {
    title: string;
    product: string;
    specCode: string;
    version: string;
    status: string;
    appliesTo: string;
    approvedBy: string;
    approvedAt: string;
    notApproved: string;
  };
  parameters: {
    title: string;
    name: string;
    type: string;
    target: string;
    min: string;
    max: string;
    unit: string;
    critical: string;
    criticalBadge: string;
    empty: string;
  };
  actions: {
    title: string;
    submitForReview: string;
    submitting: string;
    approve: string;
    supersede: string;
    supersedeNoTarget: string;
    supersedePick: string;
    supersedePlaceholder: string;
    superseding: string;
    formIncomplete: string;
    submitError: string;
    supersedeError: string;
  };
  supersededImmutable: string;
  statusValues: Record<SpecStatus, string>;
  appliesToValues: Record<string, string>;
  typeValues: Record<string, string>;
  sign: SpecSignLabels;
};

export function SpecDetailClient({
  spec,
  canApprove,
  canSubmit,
  canSupersede,
  supersedeCandidates,
  labels,
  locale,
  submitForReviewAction,
  approveSpecAction,
  supersedeSpecAction,
}: {
  spec: SpecDetail;
  canApprove: boolean;
  canSubmit: boolean;
  canSupersede: boolean;
  supersedeCandidates: SupersedeCandidate[];
  labels: SpecDetailLabels;
  locale: string;
  submitForReviewAction: SubmitSpecForReviewFn;
  approveSpecAction: ApproveSpecFn;
  supersedeSpecAction: SupersedeSpecFn;
}) {
  const router = useRouter();
  const [signOpen, setSignOpen] = useState(false);
  const [supersedeBy, setSupersedeBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const criticalCount = spec.parameters.filter((p) => p.isCritical).length;

  function submitForReview() {
    setError(null);
    startTransition(async () => {
      const result = await submitForReviewAction({ specId: spec.id });
      if (!result.ok) {
        setError(labels.actions.submitError.replace('{message}', result.message ?? result.reason));
        return;
      }
      router.refresh();
    });
  }

  function supersede() {
    setError(null);
    if (supersedeBy === '') return;
    startTransition(async () => {
      const result = await supersedeSpecAction({ specId: spec.id, bySpecId: supersedeBy });
      if (!result.ok) {
        setError(labels.actions.supersedeError.replace('{message}', result.message ?? result.reason));
        return;
      }
      router.refresh();
    });
  }

  const bannerByStatus: Record<SpecStatus, { text: string; cls: string }> = {
    draft: { text: labels.banner.draft, cls: 'border-slate-200 bg-slate-50 text-slate-700' },
    under_review: { text: labels.banner.under_review, cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    active: {
      text: labels.banner.active
        .replace('{approver}', spec.approvedBy ?? '—')
        .replace('{approvedAt}', spec.approvedAt ? spec.approvedAt.slice(0, 10) : '—'),
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    superseded: { text: labels.banner.superseded, cls: 'border-slate-200 bg-slate-100 text-slate-500' },
    expired: { text: labels.banner.expired, cls: 'border-red-200 bg-red-50 text-red-700' },
  };
  const banner = bannerByStatus[spec.status];

  const headerRows: Array<[string, React.ReactNode]> = [
    [
      labels.header.product,
      <>
        <span className="font-mono text-xs text-sky-700">{spec.productCode}</span>
        <span className="ml-2">{spec.productName}</span>
      </>,
    ],
    [labels.header.specCode, <span className="font-mono">{spec.specCode}</span>],
    [labels.header.version, <span className="font-mono">v{spec.version}</span>],
    [labels.header.appliesTo, labels.appliesToValues[spec.appliesTo] ?? spec.appliesTo],
    [labels.header.approvedBy, spec.approvedBy ?? labels.header.notApproved],
    [labels.header.approvedAt, spec.approvedAt ? spec.approvedAt.slice(0, 10) : labels.header.notApproved],
  ];

  return (
    <div
      data-testid="spec-detail"
      data-status={spec.status}
      className={['flex flex-col gap-6', spec.status === 'superseded' ? 'opacity-70' : ''].join(' ')}
    >
      {/* Header (parity specs-screens.jsx:312-320). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href={`/${locale}/quality/specifications`}
            data-testid="spec-detail-back"
            className="text-sm text-sky-700 hover:underline"
          >
            {labels.backToSpecs}
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-950">
            <span>
              {spec.productName ?? spec.productCode ?? ''} — <span className="font-mono">{spec.specCode}</span> v{spec.version}
            </span>
            <Badge variant={STATUS_VARIANT[spec.status]} data-testid="spec-detail-status">
              {labels.statusValues[spec.status]}
            </Badge>
          </h1>
        </div>
      </div>

      {/* Status banner per state (task contract + parity specs-screens.jsx:328-333). */}
      <div
        role="note"
        data-testid="spec-detail-banner"
        data-banner-status={spec.status}
        className={['rounded-xl border px-4 py-3 text-sm', banner.cls].join(' ')}
      >
        {spec.status === 'active' ? <span aria-hidden className="mr-1">🔒</span> : null}
        {banner.text}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          {/* Header card (parity specs-screens.jsx:337-347). */}
          <Card className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{labels.header.title}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {headerRows.map(([label, value], i) => (
                <div key={i} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Parameters table (parity specs-screens.jsx:365-384). */}
          <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
              {labels.parameters.title.replace('{count}', String(spec.parameters.length))}
            </h2>
            {spec.parameters.length === 0 ? (
              <p data-testid="spec-detail-params-empty" className="px-4 py-8 text-center text-sm text-slate-500">
                {labels.parameters.empty}
              </p>
            ) : (
              <Table aria-label={labels.parameters.title.replace('{count}', String(spec.parameters.length))}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.parameters.name}</TableHead>
                    <TableHead scope="col">{labels.parameters.type}</TableHead>
                    <TableHead scope="col">{labels.parameters.target}</TableHead>
                    <TableHead scope="col">{labels.parameters.min}</TableHead>
                    <TableHead scope="col">{labels.parameters.max}</TableHead>
                    <TableHead scope="col">{labels.parameters.unit}</TableHead>
                    <TableHead scope="col">{labels.parameters.critical}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spec.parameters.map((p, i) => (
                    <TableRow
                      key={`${p.parameterName}-${i}`}
                      data-testid={`spec-param-row-${i}`}
                      className={p.isCritical ? 'bg-red-50/40' : undefined}
                    >
                      <TableCell className="text-xs text-slate-800">{p.parameterName}</TableCell>
                      <TableCell>
                        <Badge variant="muted" className="text-[10px]">
                          {labels.typeValues[p.parameterType] ?? p.parameterType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{p.targetValue ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{p.minValue ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{p.maxValue ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{p.unit ?? '—'}</TableCell>
                      <TableCell>
                        {p.isCritical ? (
                          <span data-testid={`spec-param-critical-${i}`} className="text-xs font-semibold text-red-600">
                            {labels.parameters.criticalBadge}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        {/* Sidebar: signature + actions (parity specs-screens.jsx:396-408). */}
        <div className="flex flex-col gap-4">
          <Card className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{labels.actions.title}</h2>
            <div className="flex flex-col gap-3">
              {/* Draft → submit for review. */}
              {spec.status === 'draft' && canSubmit && (
                <button
                  type="button"
                  data-testid="spec-submit-review"
                  disabled={pending}
                  onClick={submitForReview}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
                >
                  {pending ? labels.actions.submitting : labels.actions.submitForReview}
                </button>
              )}

              {/* Under review → approve (e-sign modal). */}
              {spec.status === 'under_review' && canApprove && (
                <button
                  type="button"
                  data-testid="spec-approve-open"
                  onClick={() => setSignOpen(true)}
                  className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-800"
                >
                  {labels.actions.approve}
                </button>
              )}

              {/* Active → supersede with a newer version. */}
              {spec.status === 'active' && canSupersede && (
                <div className="flex flex-col gap-2" data-testid="spec-supersede-block">
                  {supersedeCandidates.length === 0 ? (
                    <button
                      type="button"
                      data-testid="spec-supersede-disabled"
                      disabled
                      title={labels.actions.supersedeNoTarget}
                      className="cursor-not-allowed rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-400"
                    >
                      {labels.actions.supersede}
                    </button>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-slate-700">{labels.actions.supersedePick}</span>
                      <div data-testid="spec-supersede-select">
                        <Select
                          aria-label={labels.actions.supersedePick}
                          value={supersedeBy}
                          onValueChange={setSupersedeBy}
                          placeholder={labels.actions.supersedePlaceholder}
                          options={supersedeCandidates.map((c) => ({ value: c.id, label: `v${c.version}` }))}
                        />
                      </div>
                      <button
                        type="button"
                        data-testid="spec-supersede-submit"
                        disabled={supersedeBy === '' || pending}
                        onClick={supersede}
                        title={supersedeBy === '' ? labels.actions.formIncomplete : undefined}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
                      >
                        {pending ? labels.actions.superseding : labels.actions.supersede}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Superseded → immutable, no actions. */}
              {spec.status === 'superseded' && (
                <p data-testid="spec-superseded-immutable" className="text-xs text-slate-500">
                  {labels.supersededImmutable}
                </p>
              )}

              {error && (
                <p role="alert" data-testid="spec-detail-action-error" className="text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <SpecSignModal
        open={signOpen}
        onOpenChange={setSignOpen}
        spec={{
          id: spec.id,
          specCode: spec.specCode,
          version: spec.version,
          productCode: spec.productCode ?? '',
          productName: spec.productName ?? '',
          appliesTo: labels.appliesToValues[spec.appliesTo] ?? spec.appliesTo,
          parameterCount: spec.parameters.length,
          criticalCount,
        }}
        labels={labels.sign}
        approveSpecAction={approveSpecAction}
        onApproved={() => router.refresh()}
      />
    </div>
  );
}
