'use server';

/**
 * T-065 — `compareVersions` Server Action (01-NPD-g, PRD §17.11.1).
 *
 * Loads the ingredient lists for two formulation versions (org-scoped via
 * `withOrgContext` → RLS enforced as `app_user` with `app.current_org_id()`)
 * and returns a side-by-side diff (up to 50 rows × 2 versions) flagging
 * ADDED / REMOVED / CHANGED / UNCHANGED per row. READ-ONLY — no writes.
 *
 * The diff math itself is the pure `compareFormulationVersions` helper in
 * `@monopilot/domain` (deterministic, unit-tested without a DB). This action
 * only does the org-scoped reads + zod validation + shaping.
 */

import { z } from 'zod';
import {
  compareFormulationVersions,
  MAX_COMPARE_ROWS,
  type CompareIngredient,
  type CompareResult,
} from '@monopilot/domain';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

const InputSchema = z.object({
  projectId: z.string().min(1),
  versionAId: z.string().min(1),
  versionBId: z.string().min(1),
});

export type CompareVersionsInput = z.infer<typeof InputSchema>;

interface IngredientRow {
  sequence: number;
  rm_code: string;
  pct: string | null;
  qty_kg: string | null;
  cost_per_kg_eur: string | null;
}

interface VersionExistsRow {
  id: string;
}

export async function compareVersions(rawInput: CompareVersionsInput): Promise<CompareResult> {
  const input = InputSchema.parse(rawInput);

  return withOrgContext(async ({ client }) => {
    // ── existence check: BOTH versions must belong to the org's project ──────
    // A missing or wrong-project version must be a not-found error, NOT a
    // silently-empty formulation (which would mis-render every row as ADDED /
    // REMOVED). RLS already scopes to the org; the formulations.project_id join
    // confirms the version is in the requested project.
    const assertVersionInProject = async (versionId: string): Promise<void> => {
      const res = await client.query<VersionExistsRow>(
        `select fv.id
           from formulation_versions fv
           join formulations f on f.id = fv.formulation_id
          where fv.id = $1::uuid
            and f.project_id = $2::uuid`,
        [versionId, input.projectId],
      );
      if (!res.rows[0]) {
        throw new Error(
          `compareVersions: formulation version ${versionId} not found for project ${input.projectId}`,
        );
      }
    };

    await assertVersionInProject(input.versionAId);
    await assertVersionInProject(input.versionBId);

    const loadVersion = async (versionId: string): Promise<CompareIngredient[]> => {
      // RLS scopes the read to the caller's org; the join to formulation_versions
      // + formulations guarantees the version belongs to the org's project.
      // Diff identity is `sequence` (the only unique key), NOT rm_code, so
      // duplicate-RM rows are never collapsed.
      const res = await client.query<IngredientRow>(
        `select fi.sequence, fi.rm_code, fi.pct, fi.qty_kg, fi.cost_per_kg_eur
           from formulation_ingredients fi
           join formulation_versions fv on fv.id = fi.version_id
           join formulations f on f.id = fv.formulation_id
          where fi.version_id = $1::uuid
            and f.project_id = $2::uuid
          order by fi.sequence asc
          limit $3`,
        [versionId, input.projectId, MAX_COMPARE_ROWS],
      );
      return res.rows.map((r) => ({
        sequence: r.sequence,
        rmCode: r.rm_code,
        pct: r.pct,
        qtyKg: r.qty_kg,
        costPerKgEur: r.cost_per_kg_eur,
      }));
    };

    const [versionA, versionB] = [await loadVersion(input.versionAId), await loadVersion(input.versionBId)];
    return compareFormulationVersions(versionA, versionB, MAX_COMPARE_ROWS);
  });
}
