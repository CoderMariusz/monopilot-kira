/**
 * NPD project-detail INDEX page (RSC) — the project's "at a glance" body that sits
 * UNDER the persistent header + 8-stage rail owned by layout.tsx. Reached from the
 * pipeline kanban/split "Open project →".
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]
 *
 * The ProjectHeader (project.jsx:22-43) and the OPERATIONAL 8-stage rail
 * (project.jsx:4-20) now live in layout.tsx so they persist across every stage
 * route. The legacy G0-G4 gate StageRail that used to render here was REMOVED — it
 * was the redundant "too many tabs instead of a header" the user complained about.
 *
 * What remains here:
 *   7-dept status strip (product-owner addition; reuses the FA-detail strip):
 *     prototypes/design/Monopilot Design System/npd/fa-screens.jsx:365-385
 *
 * Real-data wiring (NO mocks): the 7-dept strip is derived SERVER-SIDE from the
 * project's LINKED Finished Good (product) — the same `deriveDeptStatuses` the
 * FA-detail screen uses — when the project has a `product_code` (G3+). Pre-G3
 * projects have no FG, so the strip renders an all-"pending" state with a caption.
 *
 * Required UI states: loading (streamed), empty/not-found (bad projectId), error,
 * permission-denied — all resolved server-side, never client-trusted.
 *
 * Next 16 RSC contract: DeptStatusStrip is presentational (data-only props).
 */

import { getTranslations } from 'next-intl/server';

import { getProject } from '../../../../../(npd)/pipeline/_actions/get-project';
import {
  type OrgContextLike,
} from '../../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  DEPT_KEYS,
  deriveDeptStatuses,
  type DeptKey,
  type DeptStatus,
  type GenericDeptColumn,
} from '../../../../../../lib/npd/derive-dept-statuses';
import {
  DeptStatusStrip,
  type DeptStatusItem,
} from '../../../../../../components/npd/dept-status-strip';

export const dynamic = 'force-dynamic';

// ─────────────────────────────── i18n labels ────────────────────────────────

type ProjectDetailLabels = {
  deptStrip: {
    ariaLabel: string;
    labels: Record<DeptKey, string>;
    statusLabels: Record<DeptStatus, string>;
    /** Pre-G3 caption when no FG is linked yet. */
    pendingCaption: string;
  };
  empty: string;
  emptyBody: string;
  forbidden: string;
  error: string;
};

const DEFAULTS: ProjectDetailLabels = {
  deptStrip: {
    ariaLabel: 'Department gate progress',
    labels: {
      core: 'Core',
      planning: 'Planning',
      commercial: 'Commercial',
      production: 'Production',
      technical: 'Technical',
      mrp: 'MRP',
      procurement: 'Procurement',
    },
    statusLabels: { done: 'Done', inprog: 'In progress', blocked: 'Blocked', pending: 'Pending' },
    pendingCaption: 'Departments populate once the FG is created at Gate 3.',
  },
  empty: 'Project not found',
  emptyBody: 'No project matches this id in your organisation.',
  forbidden: 'You do not have permission to view this project.',
  error: 'Unable to load this project.',
};

async function pickerFor(locale: string, namespace: string) {
  try {
    const t = await getTranslations({ locale, namespace });
    return (key: string, fallback: string) => {
      try {
        const value = t(key);
        if (value === key || value === `${namespace}.${key}`) return fallback;
        return value;
      } catch {
        return fallback;
      }
    };
  } catch {
    return (_key: string, fallback: string) => fallback;
  }
}

async function buildLabels(locale: string): Promise<ProjectDetailLabels> {
  const p = await pickerFor(locale, 'npd.projectDetail');
  const d = DEFAULTS;
  return {
    deptStrip: {
      ariaLabel: p('deptStrip.ariaLabel', d.deptStrip.ariaLabel),
      labels: {
        core: p('deptStrip.labels.core', d.deptStrip.labels.core),
        planning: p('deptStrip.labels.planning', d.deptStrip.labels.planning),
        commercial: p('deptStrip.labels.commercial', d.deptStrip.labels.commercial),
        production: p('deptStrip.labels.production', d.deptStrip.labels.production),
        technical: p('deptStrip.labels.technical', d.deptStrip.labels.technical),
        mrp: p('deptStrip.labels.mrp', d.deptStrip.labels.mrp),
        procurement: p('deptStrip.labels.procurement', d.deptStrip.labels.procurement),
      },
      statusLabels: {
        done: p('deptStrip.statusLabels.done', d.deptStrip.statusLabels.done),
        inprog: p('deptStrip.statusLabels.inprog', d.deptStrip.statusLabels.inprog),
        blocked: p('deptStrip.statusLabels.blocked', d.deptStrip.statusLabels.blocked),
        pending: p('deptStrip.statusLabels.pending', d.deptStrip.statusLabels.pending),
      },
      pendingCaption: p('deptStrip.pendingCaption', d.deptStrip.pendingCaption),
    },
    empty: p('empty', d.empty),
    emptyBody: p('emptyBody', d.emptyBody),
    forbidden: p('forbidden', d.forbidden),
    error: p('error', d.error),
  };
}

// ─────────────────────────────── data loader ────────────────────────────────

type LinkedFgDept = {
  productCode: string;
  deptStatuses: Record<DeptKey, DeptStatus>;
};

const ALL_PENDING_DEPTS: Record<DeptKey, DeptStatus> = {
  core: 'pending',
  planning: 'pending',
  commercial: 'pending',
  production: 'pending',
  technical: 'pending',
  mrp: 'pending',
  procurement: 'pending',
};

type LoaderResult = {
  state: 'ready' | 'empty' | 'permission_denied' | 'error';
  /** Linked FG dept derivation (null when no FG is linked → pre-G3). */
  linkedFg: LinkedFgDept | null;
};

type DeptColumnRow = {
  physical_column: string;
  required_for_done: boolean | null;
  display_order: number | null;
};

async function readRequiredColumns(ctx: OrgContextLike, deptCode: string): Promise<GenericDeptColumn[]> {
  const { rows } = await ctx.client.query<DeptColumnRow>(
    `select lower(dc.column_key) as physical_column,
            dc.required_for_done,
            dc.display_order
       from "Reference"."DeptColumns" dc
      where dc.org_id = app.current_org_id()
        and lower(dc.dept_code) = lower($1)
      order by dc.display_order nulls last, dc.column_key`,
    [deptCode],
  );
  return rows.map((row, i) => ({
    key: row.physical_column,
    dataType: 'text' as const,
    required: row.required_for_done === true,
    readOnly: false,
    displayOrder: row.display_order ?? i,
  }));
}

async function readProjectProductLink(ctx: OrgContextLike, projectId: string): Promise<string | null> {
  const { rows } = await ctx.client.query<{ product_code: string | null }>(
    `select product_code
       from public.npd_projects
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [projectId],
  );
  return rows[0]?.product_code ?? null;
}

async function readProductValues(ctx: OrgContextLike, productCode: string): Promise<Record<string, unknown> | null> {
  const { rows } = await ctx.client.query<{ product_json: Record<string, unknown> | null }>(
    `select to_jsonb(p.*) as product_json
       from public.product p
      where p.org_id = app.current_org_id()
        and p.product_code = $1
        and p.deleted_at is null
      limit 1`,
    [productCode],
  );
  return rows[0]?.product_json ?? null;
}

async function loadLinkedFg(projectId: string): Promise<LinkedFgDept | null> {
  return withOrgContext(async (rawCtx): Promise<LinkedFgDept | null> => {
    const ctx = rawCtx as OrgContextLike;
    const productCode = await readProjectProductLink(ctx, projectId);
    if (!productCode) return null;

    const values = await readProductValues(ctx, productCode);
    if (!values) return null;

    const [core, planning, commercial, production, technical, mrp, procurement] = await Promise.all([
      readRequiredColumns(ctx, 'Core'),
      readRequiredColumns(ctx, 'Planning'),
      readRequiredColumns(ctx, 'Commercial'),
      readRequiredColumns(ctx, 'Production'),
      readRequiredColumns(ctx, 'Technical'),
      readRequiredColumns(ctx, 'MRP'),
      readRequiredColumns(ctx, 'Procurement'),
    ]);

    const deptStatuses = deriveDeptStatuses(values, {
      core,
      planning,
      commercial,
      production,
      technical,
      mrp,
      procurement,
    });
    return { productCode, deptStatuses };
  });
}

async function loadPage(projectId: string): Promise<LoaderResult> {
  try {
    const result = await getProject({ projectId });
    if (!result.ok) {
      if (result.error === 'FORBIDDEN') {
        return { state: 'permission_denied', linkedFg: null };
      }
      if (result.error === 'NOT_FOUND') {
        return { state: 'empty', linkedFg: null };
      }
      return { state: 'error', linkedFg: null };
    }

    // Linked-FG dept derivation runs only after getProject confirmed access.
    let linkedFg: LinkedFgDept | null = null;
    try {
      linkedFg = await loadLinkedFg(projectId);
    } catch (fgError) {
      console.error('[project-detail] linked FG read failed:', fgError);
      linkedFg = null; // degrade to pending strip, never fail the whole page
    }

    return { state: 'ready', linkedFg };
  } catch (error) {
    console.error('[project-detail] org-scoped read failed:', error);
    return { state: 'error', linkedFg: null };
  }
}

// ─────────────────────────────── view helpers ────────────────────────────────

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <div role="alert" data-testid={testId} className="card" style={{ textAlign: 'center', padding: 32 }}>
      <p style={{ fontSize: 15, fontWeight: 600 }}>{title}</p>
      {body ? <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>{body}</p> : null}
    </div>
  );
}

type ProjectDetailPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors gate/page.tsx + costing/page.tsx).
  loaded?: LoaderResult;
};

export default async function ProjectDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProjectDetailPageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const loaded: LoaderResult = props.loaded ?? (await loadPage(projectId));

  if (loaded.state === 'permission_denied') {
    return <StatePanel testId="project-detail-forbidden" title={labels.forbidden} />;
  }
  if (loaded.state === 'error') {
    return <StatePanel testId="project-detail-error" title={labels.error} />;
  }
  if (loaded.state === 'empty') {
    return <StatePanel testId="project-detail-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const { linkedFg } = loaded;

  // Dept strip — derived server-side from the linked FG (G3+); pre-G3 = all pending.
  const deptStatuses = linkedFg?.deptStatuses ?? ALL_PENDING_DEPTS;
  const deptStripItems: DeptStatusItem[] = DEPT_KEYS.map((deptKey, i) => ({
    dept: deptKey,
    label: labels.deptStrip.labels[deptKey],
    status: deptStatuses[deptKey],
    index: i + 1,
  }));

  return (
    <section className="flex w-full flex-col gap-3" data-testid="project-detail-body">
      {/* 7-DEPT STATUS STRIP (product-owner addition; reuses fa-screens.jsx:365-385) */}
      <DeptStatusStrip
        items={deptStripItems}
        ariaLabel={labels.deptStrip.ariaLabel}
        statusLabels={labels.deptStrip.statusLabels}
      />
      {!linkedFg ? (
        <p
          className="muted"
          style={{ fontSize: 12, marginTop: -4 }}
          data-testid="project-detail-dept-pending-caption"
        >
          {labels.deptStrip.pendingCaption}
        </p>
      ) : null}
    </section>
  );
}
