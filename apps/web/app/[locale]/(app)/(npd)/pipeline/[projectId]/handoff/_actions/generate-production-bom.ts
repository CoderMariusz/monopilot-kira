'use server';

/**
 * NPD HANDOFF — `generateProductionBom` Server Action.
 *
 * Breaks the handoff DEADLOCK: the "Promote to production BOM" button is disabled
 * until the ACTIVE_SHARED_BOM_REQUIRED + FACTORY_SPEC_REQUIRED release gates pass,
 * but those gates were only ever satisfied INSIDE the promote transaction — so the
 * user could never click promote to create the very BOM the button required. This
 * action runs the real BOM-materialization (`materializeNpdBom`) on its own, so the
 * user can GENERATE the production BOM (RM from the locked recipe + packaging PM
 * lines), review/correct it, and only THEN promote.
 *
 * It is idempotent: a later promote re-runs materialize, finds the existing active
 * BOM + factory_spec, and reuses them — so manual corrections to the generated BOM
 * survive. No project archive / release happens here (that is promote's job).
 *
 * Gate = `npd.handoff.promote` (same as the promote button; the materialize itself
 * is org-scoped via app.current_org_id()). NOTE: the production code currently equals
 * the NPD product_code — the FG-002 rename is deferred to the product→items merge.
 */

import { z } from 'zod';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { materializeNpdBom } from '../../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-bom';
import { materializeNpdRouting } from '../../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-routing';
import { hasHandoffPermission } from './get-handoff';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';

const Input = z.object({ projectId: z.string().uuid() });

export type GenerateProductionBomRoutingWarningCode = 'no_processes' | 'no_line' | 'routing_draft' | 'cross_site_lines';

export type GenerateProductionBomRoutingWarning = {
  code: GenerateProductionBomRoutingWarningCode;
};

export type GenerateProductionBomError =
  | 'invalid_input'
  | 'forbidden'
  | 'no_recipe'
  | 'production_code_conflict'
  | 'packs_per_box_required'
  | 'packaging_unlinked'
  | 'bom_materialization_failed'
  | 'persistence_failed';

export type GenerateProductionBomResult =
  | {
      ok: true;
      data: {
        productionCode: string | null;
        bomHeaderId: string | null;
        yieldPromptRequired: boolean;
        warnings: GenerateProductionBomRoutingWarning[];
      };
    }
  | {
      ok: false;
      error: GenerateProductionBomError;
      message?: string;
      /** Present when error === 'packaging_unlinked'. */
      unlinkedComponents?: string[];
    };

const PERMISSION = 'npd.handoff.promote';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type PackagingUnlinkedRow = { component_name: string };

async function findUnlinkedPackagingComponents(client: QueryClient, projectId: string): Promise<string[]> {
  const { rows } = await client.query<PackagingUnlinkedRow>(
    `select component_name
       from public.packaging_components
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and item_id is null
      order by display_order, component_name`,
    [projectId],
  );
  return rows.map((row) => row.component_name);
}

type InnerGenerateResult =
  | {
      ok: true;
      productionCode: string | null;
      bomHeaderId: string | null;
      yieldPromptRequired: boolean;
      warnings: GenerateProductionBomRoutingWarning[];
    }
  | {
      ok: false;
      error: GenerateProductionBomError;
      message?: string;
      unlinkedComponents?: string[];
    };

function packagingUnlinkedFailure(unlinkedComponents: string[]): InnerGenerateResult {
  const names = unlinkedComponents.join(', ');
  return {
    ok: false,
    error: 'packaging_unlinked',
    unlinkedComponents,
    message: `packaging components not linked to items: ${names}`,
  };
}

export async function generateProductionBom(raw: unknown): Promise<GenerateProductionBomResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const { projectId } = parsed.data;

  try {
    const result = await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      if (!(await hasHandoffPermission(ctx, PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const unlinkedComponents = await findUnlinkedPackagingComponents(ctx.client, projectId);
      if (unlinkedComponents.length > 0) {
        return packagingUnlinkedFailure(unlinkedComponents);
      }

      const materialized = await materializeNpdBom(ctx, { projectId });
      if (materialized.code === 'PRODUCTION_CODE_CONFLICT') {
        return { ok: false as const, error: 'production_code_conflict' as const };
      }
      if (materialized.code === 'PACKS_PER_BOX_REQUIRED') {
        return { ok: false as const, error: 'packs_per_box_required' as const };
      }
      // No locked formulation / no ingredients ⇒ no BOM could be built.
      if (!materialized.bomHeaderId) {
        return { ok: false as const, error: 'no_recipe' as const };
      }

      const warnings: GenerateProductionBomRoutingWarning[] = [];
      const routing = await materializeNpdRouting(ctx.client, projectId);
      if (!routing.ok && routing.code !== 'routing_exists') {
        if (
          routing.code === 'no_processes' ||
          routing.code === 'no_line' ||
          routing.code === 'cross_site_lines'
        ) {
          warnings.push({ code: routing.code });
        }
      } else if (routing.ok) {
        // L8 MED-1: the materialized routing is a DRAFT — WOs copy operations
        // only from an ACTIVE routing, so tell the user to approve it in
        // Technical instead of leaving a silent dead end.
        warnings.push({ code: 'routing_draft' });
      }

      return {
        ok: true as const,
        productionCode: materialized.productionCode ?? materialized.productCode,
        bomHeaderId: materialized.bomHeaderId,
        yieldPromptRequired: materialized.yieldPromptRequired,
        warnings,
      };
    });

    if (!result.ok) return result;

    safeRevalidatePath(`/[locale]/(app)/(npd)/pipeline/${projectId}/handoff`);

    return {
      ok: true,
      data: {
        productionCode: result.productionCode,
        bomHeaderId: result.bomHeaderId,
        yieldPromptRequired: result.yieldPromptRequired,
        warnings: result.warnings,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Could not generate production BOM header:')) {
      console.error('[generateProductionBom] bom_materialization_failed:', message);
      return { ok: false, error: 'bom_materialization_failed', message };
    }
    console.error('[generateProductionBom] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path, 'page');
  } catch {
    // Vitest imports Server Actions outside a Next request store.
  }
}
