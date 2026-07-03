import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { listChecklistTemplates } from './_actions/list-checklist-templates';
import { NPD_CHECKLIST_PERMISSION } from './_actions/checklist-template-schema';
import NpdChecklistScreen, { type NpdChecklistScreenLabels } from './npd-checklist-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function canEditNpdSchema(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, NPD_CHECKLIST_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

const DEFAULT_LABELS: NpdChecklistScreenLabels = {
    title: 'Gate checklists',
    subtitle: 'Manage the default G0–G4 gate checklist templates copied into new NPD projects.',
    readOnlyNotice: 'You can view gate checklist templates but need npd.schema.edit to change them.',
    forbidden: 'You do not have permission to view gate checklist templates.',
    loadError: 'Could not load gate checklist templates. Try again.',
    propagate: 'Propagate to open projects',
    propagating: 'Propagating…',
    propagateSuccess:
      'Propagated to {projects} open project(s): {inserted} inserted, {updated} updated, {deleted} unchecked removed.',
    propagateError: 'Could not propagate checklist templates to open projects.',
    addItem: 'Add item',
    addItemTitle: 'Add checklist item',
    deleteItem: 'Delete',
    deleteItemTitle: 'Delete checklist item',
    deleteItemBody:
      'Remove this item from the org template. Checked items on open projects are preserved when you propagate.',
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    deleting: 'Deleting…',
    save: 'Save',
    cancel: 'Cancel',
    create: 'Add',
    saving: 'Saving…',
    actionError: 'Could not save changes. Try again.',
    emptyGate: 'No checklist items for this gate.',
    columnText: 'Item',
    columnCategory: 'Category',
    columnRequired: 'Required',
    columnActions: 'Actions',
    fieldGate: 'Gate',
    fieldCategory: 'Category',
    fieldText: 'Item text',
    fieldRequired: 'Required',
    requiredYes: 'Yes',
    requiredNo: 'No',
    moveUp: 'Move up',
    moveDown: 'Move down',
    editText: 'Edit',
    validationTextRequired: 'Item text is required.',
    gateLabels: {
      G0: 'G0 — Idea',
      G1: 'G1 — Feasibility',
      G2: 'G2 — Business case',
      G3: 'G3 — Development',
      G4: 'G4 — Testing / handoff',
    },
    categoryLabels: {
      business: 'Business',
      technical: 'Technical',
      compliance: 'Compliance',
    },
};

// F6 (W1 walk): screen rendered EN-on-PL — thread settings.npdChecklist.* with
// per-key fallback to the EN defaults (next-intl returns the namespaced key when
// a message is missing).
async function buildLabels(locale: string): Promise<NpdChecklistScreenLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.npdChecklist' });
    const out: Record<string, string> = { ...(DEFAULT_LABELS as unknown as Record<string, string>) };
    for (const key of Object.keys(out)) {
      const snake = key.replace(/[A-Z]/g, (ch) => '_' + ch.toLowerCase());
      try {
        const value = t(snake);
        if (value && value !== snake && !value.includes('npdChecklist')) out[key] = value;
      } catch {
        // keep EN default
      }
    }
    return out as unknown as NpdChecklistScreenLabels;
  } catch {
    return DEFAULT_LABELS;
  }
}


export default async function NpdChecklistSettingsPage({ params }: PageProps = {}) {
  const { locale } = params ? await params : { locale: 'en' };

  const [result, canEdit, labels] = await Promise.all([
    listChecklistTemplates(),
    canEditNpdSchema(),
    buildLabels(locale),
  ]);

  if (!result.ok && result.code === 'forbidden') {
    return (
      <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
        <div className="alert alert-amber" role="status" data-testid="npd-checklist-forbidden">
          {labels.forbidden}
        </div>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
        <div className="alert alert-red" role="alert" data-testid="npd-checklist-load-error">
          {labels.loadError}
        </div>
      </main>
    );
  }

  return <NpdChecklistScreen templates={result.data} canEdit={canEdit} labels={labels} />;
}
