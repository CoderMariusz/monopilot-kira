/**
 * @vitest-environment jsdom
 *
 * PF-R20-06 — D365 export-only UI boundary tests.
 *
 * Asserts production surfaces do not advertise inbound pull/import controls or
 * labels. Server enforcement lives in export-only-policy.ts; these tests guard
 * the UI seam the audit flagged.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { D365SyncConfigForm, type D365SyncLabels } from '../sync/d365-sync-config-form.client';
import D365ConnectionForm from '../d365-connection-form.client';
import { PlanningHeaderActions } from '../../../../../(modules)/planning/_components/header-actions';

afterEach(() => cleanup());

const SYNC_LABELS: D365SyncLabels = {
  title: 'D365 sync config',
  subtitle: 'Outbound export queue',
  save: 'Save',
  saved: 'Saved',
  forbiddenTitle: 'Forbidden',
  sections: { polling: 'Export queue', retry: 'Retry', dlq: 'DLQ' },
  fields: {
    pullCron: 'Pull schedule cron',
    batchSize: 'Batch size',
    pushQueue: 'Push queue',
    maxAttempts: 'Max attempts',
    retryBackoff: 'Retry backoff',
  },
  hints: {
    pullCron: 'hidden',
    batchSize: 'Batch',
    pushQueue: 'Push',
    maxAttempts: 'Attempts',
    retryBackoff: 'Backoff',
  },
  status: {
    saving: 'Saving',
    lastApplied: 'Last applied',
    appliedBy: 'By {user}',
    notRecorded: '—',
    notAppliedYet: 'Never',
    enabled: 'On',
    disabled: 'Off',
    legacyNotice: 'LEGACY',
    exportOnlyNotice: 'R15 export-only: Monopilot → D365 only. Inbound pull/import is not supported.',
    invalidCron: 'Invalid cron',
    nextRunUnavailable: 'N/A',
    nextRun: 'Next {date}',
    dlqDescription: 'DLQ',
    dlqLink: 'Open DLQ',
    forbiddenBody: 'Forbidden',
  },
};

describe('PF-R20-06 D365 export-only UI', () => {
  it('does not render an inbound pull cron editor on the sync config form', () => {
    render(
      <D365SyncConfigForm
        config={{
          pull_cron: '0 2 * * *',
          batch_size: 50,
          max_attempts: 3,
          retry_backoff_minutes: 15,
          push_queue_enabled: true,
          dlq_href: '/en/settings/integrations/d365/dlq',
          last_applied_at: null,
          applied_by_user: null,
        }}
        labels={SYNC_LABELS}
        locale="en"
      />,
    );

    expect(screen.getByTestId('d365-sync-export-only-notice')).toHaveTextContent(/export-only/i);
    expect(screen.queryByLabelText(/pull schedule cron/i)).toBeNull();
    expect(screen.queryByRole('textbox', { name: /pull/i })).toBeNull();
  });

  it('does not render a Planning header control that promises D365 pull', () => {
    render(
      <PlanningHeaderActions
        createWoHref="/en/planning/work-orders?new=1"
        createPoHref="/en/planning/purchase-orders"
        createToHref="/en/planning/transfer-orders"
        labels={{
          createWo: 'Create WO',
          createPo: 'Create PO',
          createTo: 'Create TO',
          runSequencing: 'Run sequencing',
          notAvailable: 'Not available yet',
        }}
      />,
    );

    expect(screen.queryByTestId('planning-action-triggerD365')).toBeNull();
    expect(screen.queryByRole('button', { name: /trigger d365 pull/i })).toBeNull();
  });

  it('does not render an editable export-queue cron field on the connection screen', () => {
    render(
      <D365ConnectionForm
        state="ready"
        config={{
          baseUrl: 'https://apex.operations.dynamics.com',
          environment: 'Production',
          tenantId: '7b6a5d44-4c39-4f2e-95a2-3263db0dd4d3',
          clientId: 'client-app-123456',
          clientSecretSet: true,
          serviceAccountEmail: 'd365-service@apex.example',
          pollCron: '0 2 * * *',
          enabled: true,
          lastTest: { ok: true, at: '2026-05-20T14:02:00.000Z', latencyMs: 138, environment: 'Production' },
        }}
        labels={{
          title: 'D365 connection',
          subtitle: 'Export-only',
          testConnection: 'Test connection',
          save: 'Save',
          rotateSecret: 'Rotate',
          secretRotated: 'Rotated',
          urlInvalid: 'URL_INVALID',
          loading: 'Loading',
          empty: 'Empty',
          error: 'Error',
        }}
        syncConfigHref="/en/settings/integrations/d365/sync"
      />,
    );

    expect(screen.getByTestId('d365-connection-export-only-notice')).toHaveTextContent(/export-only/i);
    expect(screen.getByTestId('d365-connection-export-schedule-notice')).toHaveTextContent(/sync config page/i);
    expect(screen.queryByRole('textbox', { name: /export queue cron|pull cron/i })).toBeNull();
  });
});
