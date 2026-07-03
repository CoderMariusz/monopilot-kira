/**
 * NPD PILOT stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/pilot
 *
 * Server Component. Reads REAL, org-scoped data via the getPilotRun Server
 * Action (RLS as app_user with app.current_org_id()). No mocks, no hard-coded
 * rows. Money/qty are carried as decimal STRINGS end-to-end.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:352-409 (PilotScreen)
 *   (the LEGACY banner at lines 355-361 is intentionally OMITTED — this is a live screen)
 *
 * RBAC: getPilotRun gates on `npd.pilot.read`; the checklist toggle + run/material
 * upserts gate on `npd.pilot.write`. permission_denied → the permission-denied
 * state. Each write action is wrapped in an inline 'use server' adapter so a
 * serializable function prop crosses the RSC boundary (Next 16 guard). The
 * actions own their own RBAC — `canWrite` here only decides which affordances to
 * render and is NEVER trusted as the authorization gate.
 */

import { getTranslations } from 'next-intl/server';

import {
  PilotScreen,
  type PageState,
  type PilotLabels,
  type PilotScreenData,
  type ProductionLineOption,
  type PilotRecipeMaterialView,
  type SupervisorOption,
  type ToggleChecklistCall,
  type ToggleChecklistOutcome,
  type PilotActionOutcome,
  type LoadRecipeMaterialsCall,
  type UpsertRunCall,
  type CreatePilotWoCall,
  type CreatePilotWoOutcome,
} from './_components/pilot-screen';
import { getPilotRun, hasPilotPermission } from './_actions/get-pilot-run';
import { togglePilotChecklistItem } from './_actions/toggle-pilot-checklist-item';
import { upsertPilotRun } from './_actions/upsert-pilot-run';
import { createPilotWorkOrder, getPilotWorkOrderLink } from './_actions/create-pilot-wo';
import { listProductionLines } from './_actions/list-production-lines';
import { getPilotRecipeMaterials } from './_actions/get-pilot-recipe-materials';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { loadStageDeptSections } from '../../../../../../(npd)/pipeline/_actions/load-stage-dept-sections';
import {
  getCloseSectionLabel,
  getStageDeptSectionLabels,
} from '../../../../../../(npd)/pipeline/_lib/get-stage-dept-section-labels';
import { StageDeptSections } from '../../../../../../(npd)/pipeline/_components/StageDeptSections';

export const dynamic = 'force-dynamic';

type PilotPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx).
  data?: PilotScreenData | null;
  state?: PageState;
};

type LoaderResult = {
  state: PageState;
  data: PilotScreenData | null;
  canWrite: boolean;
  supervisors: SupervisorOption[];
  lines: ProductionLineOption[];
  recipeMaterials: PilotRecipeMaterialView[];
  pilotWorkOrder: PilotScreenData['pilotWorkOrder'];
  fgBaseUom: string | null;
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const WRITE_PERMISSION = 'npd.pilot.write';

const DEFAULT_LABELS: PilotLabels = {
  title: 'Pilot production',
  breadcrumb: 'NPD / Pilot production',
  scheduledPilot: 'Scheduled pilot:',
  scheduledPilotBody: '{date} · {line} · {batch} batch · Supervisor: {supervisor}',
  supervisorLabel: 'Supervisor',
  noSupervisor: 'Unassigned',
  planTitle: 'Pilot run plan',
  colLine: 'Line',
  colBatchSize: 'Batch size',
  colExpectedYield: 'Expected yield',
  colDuration: 'Duration',
  unitKg: 'kg',
  unitPct: '%',
  unitHours: 'h',
  materialTitle: 'Material reservation',
  colIngredient: 'Ingredient',
  colRequired: 'Required',
  colAvailable: 'Available',
  colReserved: 'Reserved',
  colStatus: 'Status',
  statusReserved: '✓ Reserved',
  statusShort: '⚠ Short {shortBy}',
  shortCallout: 'Materials short by {shortBy}. Raise a PO or reduce the batch size.',
  checklistTitle: 'Pilot checklist',
  loading: 'Loading pilot data…',
  empty: 'No pilot run planned yet',
  emptyBody: 'A pilot run is scheduled once the formulation and trials are complete.',
  error: 'Unable to load pilot data.',
  forbidden: 'You do not have permission to view the pilot stage.',
  notSet: '—',
  planPilotRun: '+ Plan pilot run',
  editPlan: 'Edit plan',
  fieldPlannedDate: 'Planned date',
  fieldLine: 'Production line',
  fieldLineRequired: 'Production line is required.',
  linePlaceholder: 'Select a line…',
  noLines: 'No production lines configured.',
  selectLineHint: 'Select a line to see ingredient availability.',
  fieldBatchSize: 'Batch size ({unit})',
  batchUnitLabel: 'kg',
  fieldExpectedYield: 'Expected yield (%)',
  fieldDuration: 'Duration (hours)',
  fieldSupervisor: 'Supervisor',
  fieldStatus: 'Status',
  statusPlanned: 'Planned',
  statusInProgress: 'In progress',
  statusCompleted: 'Completed',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save. Check the values and try again.',
  pilotWoTitle: 'Pilot work order',
  createPilotWo: 'Create pilot WO',
  creatingPilotWo: 'Creating pilot WO…',
  pilotWoLinked: 'Pilot work order:',
  pilotWoLinkLabel: '{woNumber}',
  createPilotWoError: 'Could not create the pilot work order. Try again.',
  createPilotWoErrorNoFg: 'Link a finished-good product to this project before creating a pilot work order.',
  createPilotWoErrorRecipe: 'Lock the recipe version (or activate a production BOM) before creating a pilot work order.',
  createPilotWoErrorForbidden: 'You do not have permission to create a pilot work order.',
  createPilotWoErrorPlanning: 'Planning rejected the work order',
  createPilotWoErrorLineRequired: 'Select a production line for the pilot run first.',
  createPilotWoErrorNoActiveSite: 'The selected line has no active site. Pick a line with a site assigned.',
  createPilotWoErrorPlanningWrite: 'Your role is missing npd.planning.write — ask an admin to grant it.',
  createPilotWoErrorDocumentMaskMissing: 'The organization has no WO numbering mask configured (Settings > Documents).',
  createPilotWoErrorFgItemMissing: 'The FG item record is missing from the item master. Re-create or map the FG candidate.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof PilotLabels>;

function translateLabel(t: (key: string) => string, key: keyof PilotLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] ?? '' : value;
  } catch {
    return DEFAULT_LABELS[key] ?? '';
  }
}

async function buildLabels(locale: string): Promise<PilotLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.pilot' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as PilotLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

/** Resolve write capability + the supervisor picker options (org-scoped). */
async function readWriteContext(): Promise<{ canWrite: boolean; supervisors: SupervisorOption[] }> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };
      const canWrite = await hasPilotPermission(ctx, WRITE_PERMISSION);
      const supervisors = await ctx.client.query<{ id: string; name: string }>(
        `select id::text as id, coalesce(display_name, email::text, id::text) as name
           from public.users
          where org_id = app.current_org_id()
          order by name asc
          limit 200`,
      );
      return { canWrite, supervisors: supervisors.rows.map((u) => ({ id: u.id, name: u.name })) };
    });
  } catch (error) {
    console.error('[pilot] write-context read failed:', error);
    return { canWrite: false, supervisors: [] };
  }
}

/** Production-line dropdown options (org-scoped). Empty on any failure. */
async function readLines(): Promise<ProductionLineOption[]> {
  try {
    return await listProductionLines();
  } catch (error) {
    console.error('[pilot] production-line read failed:', error);
    return [];
  }
}

/**
 * Recipe ingredients for the run's persisted line. Required comes from the
 * recipe; Available/Reserved resolve against the line's warehouse (0 when the
 * line is unset). Empty on any failure (e.g. no recipe yet).
 */
async function readRecipeMaterials(
  projectId: string,
  lineCode: string | null,
): Promise<PilotRecipeMaterialView[]> {
  try {
    const rows = await getPilotRecipeMaterials({ projectId, lineCode });
    return rows.map((r) => ({
      ingredientCode: r.ingredientCode,
      ingredientName: r.ingredientName,
      requiredKg: r.requiredKg,
      availableKg: r.availableKg,
      reservedKg: r.reservedKg,
      status: r.status,
    }));
  } catch (error) {
    console.error('[pilot] recipe-materials read failed:', error);
    return [];
  }
}

async function readFgBaseUom(projectId: string): Promise<string | null> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { client: QueryClient };
      const { rows } = await ctx.client.query<{ uom_base: string | null }>(
        `select i.uom_base
           from public.items i
           join public.npd_projects p
             on p.id = $1::uuid
            and p.org_id = i.org_id
          where i.org_id = app.current_org_id()
            and i.npd_project_id = p.id
            and i.item_type = 'fg'
          order by i.created_at asc
          limit 1`,
        [projectId],
      );
      return rows[0]?.uom_base ?? null;
    });
  } catch (error) {
    console.error('[pilot] fg base uom read failed:', error);
    return null;
  }
}

async function readPageData(projectId: string): Promise<LoaderResult> {
  const [{ canWrite, supervisors }, result, lines, pilotWorkOrder, fgBaseUom] = await Promise.all([
    readWriteContext(),
    getPilotRun({ projectId }),
    readLines(),
    getPilotWorkOrderLink(projectId),
    readFgBaseUom(projectId),
  ]);

  if (result.ok) {
    // Recipe ingredients resolved for the persisted line's warehouse.
    const recipeMaterials = await readRecipeMaterials(projectId, result.data.run.line);
    const data: PilotScreenData = {
      run: result.data.run,
      checklist: result.data.checklist,
      supervisors,
      canWrite,
      lines,
      recipeMaterials,
      pilotWorkOrder,
      fgBaseUom,
    };
    return { state: 'ready', data, canWrite, supervisors, lines, recipeMaterials, pilotWorkOrder, fgBaseUom };
  }
  switch (result.error) {
    case 'forbidden':
      return {
        state: 'permission_denied',
        data: null,
        canWrite: false,
        supervisors: [],
        lines: [],
        recipeMaterials: [],
        pilotWorkOrder: null,
        fgBaseUom: null,
      };
    case 'not_found':
      return {
        state: 'empty',
        data: null,
        canWrite,
        supervisors,
        lines,
        recipeMaterials: [],
        pilotWorkOrder,
        fgBaseUom,
      };
    case 'invalid_input':
      return {
        state: 'error',
        data: null,
        canWrite,
        supervisors,
        lines,
        recipeMaterials: [],
        pilotWorkOrder: null,
        fgBaseUom: null,
      };
    default:
      return {
        state: 'error',
        data: null,
        canWrite,
        supervisors,
        lines,
        recipeMaterials: [],
        pilotWorkOrder: null,
        fgBaseUom: null,
      };
  }
}

async function readStageSections(projectId: string) {
  if (!projectId) return null;
  try {
    return await loadStageDeptSections({ projectId, stage: 'pilot' });
  } catch (error) {
    console.error('[pilot] stage department sections read failed:', error);
    return null;
  }
}

export default async function PilotPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PilotPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  // Inline 'use server' adapters — serializable function props across the RSC
  // boundary (Next 16). Each action owns its own RBAC (npd.pilot.write).
  async function toggleChecklistAction(call: ToggleChecklistCall): Promise<ToggleChecklistOutcome> {
    'use server';
    const result = await togglePilotChecklistItem({
      projectId,
      itemId: call.itemId,
      isChecked: call.isChecked,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  async function upsertRunAction(call: UpsertRunCall): Promise<PilotActionOutcome> {
    'use server';
    const result = await upsertPilotRun({
      projectId,
      pilotRunId: call.pilotRunId,
      plannedDate: call.plannedDate,
      line: call.line,
      batchSizeKg: call.batchSizeKg,
      expectedYieldPct: call.expectedYieldPct,
      durationHours: call.durationHours,
      supervisorUserId: call.supervisorUserId,
      status: call.status,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  // Re-derive recipe ingredients + availability when the line changes (client →
  // server → client) so Available/Reserved track the chosen line's warehouse
  // without a full RSC reload. The loader owns its own RBAC (npd.pilot.read).
  async function loadRecipeMaterialsAction(
    call: LoadRecipeMaterialsCall,
  ): Promise<PilotRecipeMaterialView[]> {
    'use server';
    return readRecipeMaterials(projectId, call.lineCode);
  }

  async function createPilotWoAction(call: CreatePilotWoCall): Promise<CreatePilotWoOutcome> {
    'use server';
    const result = await createPilotWorkOrder({ projectId: call.projectId });
    if (!result.ok) {
      return { ok: false, error: result.error, message: result.message ?? result.planningError };
    }
    return { ok: true, workOrder: result.data, created: result.created };
  }

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canWrite: props.data?.canWrite ?? false,
        supervisors: props.data?.supervisors ?? [],
        lines: props.data?.lines ?? [],
        recipeMaterials: props.data?.recipeMaterials ?? [],
        pilotWorkOrder: props.data?.pilotWorkOrder ?? null,
        fgBaseUom: props.data?.fgBaseUom ?? null,
      }
    : await readPageData(projectId);
  const [stageSections, closeSectionLabel, stageDeptLabels] = await Promise.all([
    readStageSections(projectId),
    getCloseSectionLabel(locale),
    getStageDeptSectionLabels(locale),
  ]);

  return (
    <>
      {/* Costing is computed after the pilot (owner) — surface the costing link on
          this post-pilot stage instead of the recipe stage. Plain anchor, no island. */}
      <nav
        aria-label="Related"
        data-testid="pilot-related-links"
        className="mb-3 flex flex-wrap items-center gap-2 text-sm"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Related</span>
        <a
          href={`/${locale}/pipeline/${projectId}/costing-nutrition`}
          data-testid="pilot-link-costing"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 font-medium text-[var(--muted)] hover:bg-[var(--gray-050)]"
        >
          Costing
        </a>
      </nav>
      <PilotScreen
        state={loaded.state}
        data={loaded.data}
        labels={labels}
        canWrite={loaded.canWrite}
        supervisors={loaded.supervisors}
        lines={loaded.lines}
        recipeMaterials={loaded.recipeMaterials}
        pilotWorkOrder={loaded.pilotWorkOrder}
        projectId={projectId}
        onToggleChecklistItem={toggleChecklistAction}
        onUpsertRun={upsertRunAction}
        onLoadRecipeMaterials={loadRecipeMaterialsAction}
        onCreatePilotWo={createPilotWoAction}
        locale={locale}
      />
      {stageSections ? (
        <StageDeptSections
          projectId={projectId}
          stage="pilot"
          data={stageSections}
          closeSectionLabel={closeSectionLabel}
          labels={stageDeptLabels}
        />
      ) : null}
    </>
  );
}
