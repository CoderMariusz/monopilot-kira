import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  listSignoffPolicies,
  setOverconsumeThresholds,
  upsertSignoffPolicy,
} from './_actions/signoff-actions';
import SignoffPoliciesScreen, { type SignoffLabels } from './_components/signoff-policies.client';

export const dynamic = 'force-dynamic';

type PageProps = { params?: Promise<{ locale: string }> };

type QueryResult<T = Record<string, unknown>> = { rows: T[] };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type OrgContextLike = { orgId: string; client: QueryClient };

const OVERCONSUME_FLAG = 'overconsume_threshold_pct';
const OVERCONSUME_WARN_FLAG = 'overconsume_warn_pct';

const FALLBACK: SignoffLabels = {
  title: 'Sign-off policies',
  description: 'Configure how many e-signatures each approval requires and which roles may sign.',
  colType: 'Sign-off type',
  colRequired: 'Required signatures',
  colFirstSigner: 'First signer role',
  colSecondSigner: 'Second signer role',
  colSameUser: 'Allow same user',
  colActive: 'Active',
  colActions: 'Actions',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  unassigned: 'Any role',
  allowSameUserOn: 'Same user allowed',
  allowSameUserOff: 'Distinct users',
  activeOn: 'Active',
  activeOff: 'Inactive',
  saved: 'Sign-off policy saved.',
  readOnly: 'You need admin rights to change sign-off policies.',
  permissionDenied: 'You need org admin access to view sign-off policies.',
  empty: 'No sign-off policies configured yet.',
  typeLabels: {
    'production.changeover.allergen': 'Allergen machine changeover',
  },
  productionApprovalsTitle: 'Production approvals',
  thresholdLabel: 'Over-consumption tolerance (%)',
  thresholdHelp:
    'Consumption beyond required quantity above this tolerance requires supervisor PIN approval.',
  warnThresholdLabel: 'Warning threshold (%)',
  warnThresholdHelp:
    'Consumption beyond required quantity above this threshold is recorded with a warning and flagged in the audit log. Must not exceed the approval tolerance.',
  warnAboveApprove: 'Warning threshold must be less than or equal to the approval tolerance.',
  thresholdSave: 'Save tolerance',
  thresholdSaved: 'Over-consumption tolerance saved.',
};

const TYPE_KEYS = ['production.changeover.allergen'] as const;

async function buildLabels(locale: string): Promise<SignoffLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.signoff' });
    const pick = (key: keyof SignoffLabels): string => {
      try {
        const value = t(key as string);
        return value && value.length > 0 ? value : (FALLBACK[key] as string);
      } catch {
        return FALLBACK[key] as string;
      }
    };
    const typeLabels: Record<string, string> = {};
    for (const k of TYPE_KEYS) {
      try {
        typeLabels[k] = t(`types.${k.replace(/\./g, '_')}`);
      } catch {
        typeLabels[k] = FALLBACK.typeLabels[k] ?? k;
      }
    }
    return {
      title: pick('title'),
      description: pick('description'),
      colType: pick('colType'),
      colRequired: pick('colRequired'),
      colFirstSigner: pick('colFirstSigner'),
      colSecondSigner: pick('colSecondSigner'),
      colSameUser: pick('colSameUser'),
      colActive: pick('colActive'),
      colActions: pick('colActions'),
      edit: pick('edit'),
      save: pick('save'),
      cancel: pick('cancel'),
      unassigned: pick('unassigned'),
      allowSameUserOn: pick('allowSameUserOn'),
      allowSameUserOff: pick('allowSameUserOff'),
      activeOn: pick('activeOn'),
      activeOff: pick('activeOff'),
      saved: pick('saved'),
      readOnly: pick('readOnly'),
      permissionDenied: pick('permissionDenied'),
      empty: pick('empty'),
      typeLabels,
      productionApprovalsTitle: pick('productionApprovalsTitle'),
      thresholdLabel: pick('thresholdLabel'),
      thresholdHelp: pick('thresholdHelp'),
      warnThresholdLabel: pick('warnThresholdLabel'),
      warnThresholdHelp: pick('warnThresholdHelp'),
      warnAboveApprove: pick('warnAboveApprove'),
      thresholdSave: pick('thresholdSave'),
      thresholdSaved: pick('thresholdSaved'),
    };
  } catch {
    return { ...FALLBACK };
  }
}

async function readThresholdPcts(): Promise<{ approvePct: number; warnPct: number }> {
  try {
    return await withOrgContext<{ approvePct: number; warnPct: number }>(async (ctx) => {
      const context = ctx as OrgContextLike;
      const { rows } = await context.client.query<{ pct: string | null; warn_pct: string | null }>(
        `select feature_flags ->> $2 as pct,
                feature_flags ->> $3 as warn_pct
           from public.tenant_variations
          where org_id = $1::uuid
          limit 1`,
        [context.orgId, OVERCONSUME_FLAG, OVERCONSUME_WARN_FLAG],
      );
      const toPct = (raw: string | null | undefined): number => {
        const parsed = raw == null ? 0 : Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      return { approvePct: toPct(rows[0]?.pct), warnPct: toPct(rows[0]?.warn_pct) };
    });
  } catch {
    return { approvePct: 0, warnPct: 0 };
  }
}

export default async function SettingsSignoffPage({ params }: PageProps = {}) {
  const { locale } = params ? await params : { locale: 'en' };
  const [labels, loaded, thresholds] = await Promise.all([
    buildLabels(locale),
    listSignoffPolicies(),
    readThresholdPcts(),
  ]);

  if (loaded.state === 'forbidden') {
    return (
      <main data-testid="settings-signoff-page" data-screen="settings-signoff" className="space-y-3 p-6">
        <header data-region="page-head">
          <h1 className="page-title">{labels.title}</h1>
        </header>
        <section data-testid="settings-signoff-permission-denied-state" className="alert alert-amber" role="alert">
          {labels.permissionDenied}
        </section>
      </main>
    );
  }

  if (loaded.state === 'error') {
    return (
      <main data-testid="settings-signoff-page" data-screen="settings-signoff" className="space-y-3 p-6">
        <header data-region="page-head">
          <h1 className="page-title">{labels.title}</h1>
        </header>
        <section className="alert alert-red" role="alert">
          Unable to load sign-off settings.
        </section>
      </main>
    );
  }

  return (
    <main data-testid="settings-signoff-page" data-screen="settings-signoff" className="space-y-4 p-6">
      <header data-region="page-head" className="space-y-1">
        <h1 className="page-title">{labels.title}</h1>
        <p className="muted text-[13px]">{labels.description}</p>
      </header>
      <SignoffPoliciesScreen
        policies={loaded.policies}
        roles={loaded.roles}
        canEdit={loaded.canEdit}
        initialThresholdPct={thresholds.approvePct}
        initialWarnPct={thresholds.warnPct}
        labels={labels}
        upsertSignoffPolicy={upsertSignoffPolicy}
        setOverconsumeThresholds={setOverconsumeThresholds}
      />
    </main>
  );
}
