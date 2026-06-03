'use server';

/**
 * T-096 / SET-053 — thin Server Action wrapper for the Reference CSV Import
 * Wizard "Commit" step.
 *
 * Adapts the real, withOrgContext-wired backend action
 * `commitReferenceCsvImport` (T-022, apps/web/actions/reference/import-csv.ts)
 * to the wizard's CommitResult shape. All persistence — RBAC re-check, optimistic
 * concurrency / conflict detection, the INSERT/UPDATE into
 * `public.reference_tables`, materialized-view refresh, audit_log and outbox
 * write — happens inside the real action under `app.current_org_id()` RLS. This
 * wrapper authors NO data logic; it only maps the returned summary to the panel
 * counts the UI renders. The commit button is bound to THIS action — it is not a
 * dead button.
 */

import { commitReferenceCsvImport } from '../../../../../../../../../actions/reference/import-csv';

export type WizardCommitResult = {
  status: 'complete';
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type CommitImportResult =
  | { ok: true; commit: WizardCommitResult }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'report_not_found' | 'report_expired' | 'conflict_detected' | 'persistence_failed';
      staleRows?: string[];
    };

export async function commitImportAction(reportId: string): Promise<CommitImportResult> {
  const result = await commitReferenceCsvImport({ reportId });

  if (result.ok) {
    return {
      ok: true,
      commit: {
        status: 'complete',
        inserted: result.data.summary.inserted,
        updated: result.data.summary.updated,
        skipped: result.data.summary.skipped,
        errors: result.data.summary.errors,
      },
    };
  }

  return { ok: false, error: result.error, staleRows: result.staleRows };
}
