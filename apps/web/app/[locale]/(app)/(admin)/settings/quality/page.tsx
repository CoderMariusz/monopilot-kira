import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { setRequireGrnQcInspection } from './_actions/setRequireGrnQcInspection';
import RequireGrnQcToggle, { type RequireGrnQcToggleLabels } from './_components/RequireGrnQcToggle';

export const dynamic = 'force-dynamic';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type QualityFlagReadResult =
  | { state: 'ready'; enabled: boolean; canEdit: boolean }
  | { state: 'error'; enabled: false; canEdit: false };

const FLAG_KEY = 'require_grn_qc_inspection' as const;
const REQUIRED_PERMISSION = 'settings.flags.edit' as const;

const DEFAULT_LABELS: RequireGrnQcToggleLabels = {
  title: 'Require GRN QC inspection',
  description: 'Inbound GRNs must pass Quality inspection before stock is released.',
  comingBanner: 'When enabled, goods received against a PO are placed on a QA hold until a quality inspection is recorded.',
  onLabel: 'Inspection required',
  offLabel: 'Inspection not required',
  readOnly: 'You need settings.flags.edit to change this flag.',
  saveSuccess: 'Quality flag saved and audit log recorded.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof RequireGrnQcToggleLabels>;

async function hasSettingsFlagsEdit({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, REQUIRED_PERMISSION],
  );
  return rows.length > 0;
}

async function readQualityFlag(): Promise<QualityFlagReadResult> {
  try {
    return await withOrgContext<QualityFlagReadResult>(async (ctx): Promise<QualityFlagReadResult> => {
      const context = ctx as OrgContextLike;
      const canEdit = await hasSettingsFlagsEdit(context);
      const { rows } = await context.client.query<{ enabled: boolean | string | null }>(
        `select coalesce(feature_flags ->> $2, 'false') as enabled
           from public.tenant_variations
          where org_id = $1::uuid
          limit 1`,
        [context.orgId, FLAG_KEY],
      );
      const rawEnabled = rows[0]?.enabled;
      return { state: 'ready', enabled: rawEnabled === true || rawEnabled === 'true', canEdit };
    });
  } catch {
    return { state: 'error', enabled: false, canEdit: false };
  }
}

async function buildLabels(locale: string): Promise<RequireGrnQcToggleLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.flags.quality.require_grn_qc_inspection' });
    return LABEL_KEYS.reduce((labels, key) => {
      const messageKey = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
      try {
        labels[key] = t(messageKey);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as RequireGrnQcToggleLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function renderStateShell(labels: RequireGrnQcToggleLabels, state: 'loading' | 'empty' | 'error' | 'permission_denied') {
  const body = {
    loading: 'Loading quality settings…',
    empty: labels.offLabel,
    error: 'Unable to load quality settings.',
    permission_denied: labels.readOnly,
  }[state];
  const role = state === 'error' || state === 'permission_denied' ? 'alert' : 'status';

  const alertTone = state === 'error' ? 'alert-red' : state === 'permission_denied' ? 'alert-amber' : 'alert-blue';

  return (
    <main data-testid="settings-quality-screen" data-screen="settings-quality" className="space-y-3 p-6" aria-busy={state === 'loading'}>
      <header data-region="page-head">
        <h1 className="page-title">{labels.title}</h1>
        <p className="muted mt-1 text-[13px]">{labels.description}</p>
      </header>
      <section className={`alert ${alertTone}`} role={role}>
        {body}
      </section>
    </main>
  );
}

export default async function SettingsQualityPage({ params }: PageProps = {}) {
  const { locale } = params ? await params : { locale: 'en' };
  const [labels, loaded] = await Promise.all([buildLabels(locale), readQualityFlag()]);

  if (loaded.state === 'error') return renderStateShell(labels, 'error');

  return (
    <main data-testid="settings-quality-screen" data-screen="settings-quality" className="space-y-3 p-6">
      <header data-region="page-head" className="space-y-1">
        <h1 className="page-title">{labels.title}</h1>
        <p className="muted text-[13px]">{labels.description}</p>
      </header>
      <RequireGrnQcToggle
        initialEnabled={loaded.enabled}
        canEdit={loaded.canEdit}
        permission={REQUIRED_PERMISSION}
        labels={labels}
        setRequireGrnQcInspection={setRequireGrnQcInspection}
      />
    </main>
  );
}
