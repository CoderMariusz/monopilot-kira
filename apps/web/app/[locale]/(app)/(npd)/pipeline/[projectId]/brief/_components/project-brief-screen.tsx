'use client';

/**
 * Project-stage Brief screen (read-oriented view of the brief that created the project).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:45-105 (BriefScreen)
 *     - "Project brief" card (58-91): card-head + green "✓ Completed" badge,
 *       two-column form-grid (Product name / Category / Target launch date /
 *       Target retail price (EUR) / Pack format / Sales channel / Expected
 *       volume / Target audience), full-width Marketing claims, Constraints &
 *       requirements (textarea) + Notes (textarea).
 *     - "Attachments" card (93-102): card-head + "+ Upload" + table rows
 *       (doc icon · name · dept/person · date · ⋮).
 *
 * The brief is FROZEN after conversion, so the stage view is read-oriented: every
 * field renders read-only (no `<select>`/`<input>` editing here — the editable
 * brief lives at briefs/[briefId]). Decimal values arrive as STRINGS from the
 * server loader and are rendered verbatim (never coerced to floats).
 *
 * RBAC (`permission_denied`) is resolved server-side in page.tsx; this island is
 * never trusted for the gate. No raw function props cross the RSC boundary
 * (Next16 guard) — only serialisable data + labels + a string href.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';

import type { ProjectBriefState, ProjectBriefView } from '../_actions/read-project-brief';

export type ProjectBriefLabels = {
  cardTitle: string;
  completed: string;
  fieldProductName: string;
  fieldCategory: string;
  fieldTargetLaunch: string;
  fieldTargetPrice: string;
  fieldPackFormat: string;
  fieldSalesChannel: string;
  fieldExpectedVolume: string;
  fieldTargetAudience: string;
  fieldMarketingClaims: string;
  fieldConstraints: string;
  fieldNotes: string;
  attachmentsTitle: string;
  upload: string;
  uploadDisabledHint: string;
  attachmentsEmpty: string;
  notProvided: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

export type ProjectBriefScreenProps = {
  state: ProjectBriefState;
  data: ProjectBriefView | null;
  labels: ProjectBriefLabels;
};

function ReadField({ label, value, placeholder }: { label: string; value: string | null; placeholder: string }) {
  const hasValue = value !== null && value !== undefined && value.trim() !== '';
  return (
    <div className="field" data-testid={`project-brief-field-${slug(label)}`}>
      <label className="field__label" style={{ textTransform: 'uppercase' }}>
        {label}
      </label>
      <p className="field__value" data-empty={!hasValue}>
        {hasValue ? value : placeholder}
      </p>
    </div>
  );
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent>
        <p className="state-panel__title">{title}</p>
        {body ? <p className="state-panel__body muted">{body}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ProjectBriefScreen({ state, data, labels }: ProjectBriefScreenProps) {
  if (state === 'loading') {
    return (
      <Card data-testid="project-brief-loading" aria-busy="true">
        <CardContent>
          <div className="skeleton" style={{ height: 18, width: '40%' }} />
          <div className="skeleton" style={{ height: 120, marginTop: 12 }} />
        </CardContent>
      </Card>
    );
  }

  if (state === 'permission_denied') {
    return <StatePanel testId="project-brief-forbidden" title={labels.forbidden} />;
  }

  if (state === 'error') {
    return <StatePanel testId="project-brief-error" title={labels.error} />;
  }

  if (state === 'empty' || !data) {
    return <StatePanel testId="project-brief-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const ph = labels.notProvided;

  return (
    <div data-testid="project-brief-screen">
      <Card>
        <CardHeader className="card-head">
          <CardTitle data-testid="project-brief-card-title">{labels.cardTitle}</CardTitle>
          <Badge variant="success" data-testid="project-brief-completed-badge">
            {`✓ ${labels.completed}`}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="form-grid">
            {/* LEFT / RIGHT columns interleaved to match the prototype 2-col grid. */}
            <ReadField label={labels.fieldProductName} value={data.productName} placeholder={ph} />
            <ReadField label={labels.fieldCategory} value={data.category} placeholder={ph} />
            <ReadField label={labels.fieldTargetLaunch} value={data.targetLaunchDate} placeholder={ph} />
            <ReadField label={labels.fieldTargetPrice} value={data.targetRetailPriceEur} placeholder={ph} />
            <ReadField label={labels.fieldPackFormat} value={data.packFormat} placeholder={ph} />
            <ReadField label={labels.fieldSalesChannel} value={data.salesChannel} placeholder={ph} />
            <ReadField label={labels.fieldExpectedVolume} value={data.expectedVolume} placeholder={ph} />
            <ReadField label={labels.fieldTargetAudience} value={data.targetAudience} placeholder={ph} />
          </div>

          <ReadField label={labels.fieldMarketingClaims} value={data.marketingClaims} placeholder={ph} />
          <ReadField label={labels.fieldConstraints} value={data.constraints} placeholder={ph} />
          <ReadField label={labels.fieldNotes} value={data.notes} placeholder={ph} />
        </CardContent>
      </Card>

      <Card data-testid="project-brief-attachments">
        <CardHeader className="card-head">
          <CardTitle>{labels.attachmentsTitle}</CardTitle>
          {/* Upload backend is not wired yet — rendered per prototype, not faked. */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled
            title={labels.uploadDisabledHint}
            data-testid="project-brief-upload"
          >
            {`+ ${labels.upload}`}
          </button>
        </CardHeader>
        <CardContent>
          <p className="muted" data-testid="project-brief-attachments-empty">
            {labels.attachmentsEmpty}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
