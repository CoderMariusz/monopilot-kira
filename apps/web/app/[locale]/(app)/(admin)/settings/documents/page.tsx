import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { readOrgDocumentSettings, updateOrgDocumentSettings } from '../_actions/documents';
import DocumentsScreen, {
  type DocumentSetting,
  type DocumentsScreenLabels,
  type UpdateDocumentInput,
  type UpdateDocumentResult,
} from './documents-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

async function buildLabels(locale: string): Promise<DocumentsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.documents' });
  const en = locale === 'en' ? t : await getTranslations({ locale: 'en', namespace: 'settings.documents' });
  const label = (key: string, fallback: string): string => {
    try {
      if (t.has(key)) return t(key);
      if (en.has(key)) return en(key);
      return fallback;
    } catch {
      return fallback;
    }
  };

  return {
    title: label('title', 'Document numbering'),
    subtitle: label('subtitle', 'Number formats and archiving for purchase, transfer and work orders.'),
    loading: label('loading', 'Loading document settings...'),
    empty: label('empty', 'No document settings are configured yet.'),
    loadError: label('load_error', 'Unable to load document settings.'),
    deniedTitle: label('denied_title', 'Access denied'),
    deniedBody: label('denied_body', 'You do not have permission to view document settings.'),
    readOnlyLabel: label('read_only_label', 'Read-only'),
    readOnlyNotice: label('read_only_notice', 'You can view document settings but cannot change them.'),
    docTypeNames: {
      po: label('doc_type_po', 'Purchase orders'),
      to: label('doc_type_to', 'Transfer orders'),
      wo: label('doc_type_wo', 'Work orders'),
    },
    fieldPrefix: label('field_prefix', 'Prefix'),
    fieldPrefixHint: label('field_prefix_hint', 'Leading text shown before the date and sequence, e.g. PO.'),
    fieldDatePart: label('field_date_part', 'Date part'),
    fieldPadding: label('field_padding', 'Sequence padding'),
    fieldArchive: label('field_archive', 'Archive after (days)'),
    fieldArchiveHint: label(
      'field_archive_hint',
      'Received/closed documents older than this move to the Archive tab in Planning. Leave empty to never archive.',
    ),
    datePartOptions: {
      none: label('date_part_none', 'None'),
      YYYY: label('date_part_year', 'Year'),
      YYYYMM: label('date_part_year_month', 'Year-month'),
      YYYYMMDD: label('date_part_year_month_day', 'Year-month-day'),
    },
    previewLabel: label('preview_label', 'Live preview'),
    previewExample: label('preview_example', 'example'),
    archiveNever: label('archive_never', 'Never archive'),
    save: label('save', 'Save'),
    saving: label('saving', 'Saving...'),
    saved: label('saved', 'Saved.'),
    saveError: label('save_error', 'Could not save document settings.'),
    invalidInput: label('invalid_input', 'Check the highlighted fields and try again.'),
  };
}

export default async function DocumentsSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };

  const [labels, read] = await Promise.all([buildLabels(locale), readOrgDocumentSettings()]);

  async function updateDocumentAction(input: UpdateDocumentInput): Promise<UpdateDocumentResult> {
    'use server';
    const result = await updateOrgDocumentSettings(input);
    return result as UpdateDocumentResult;
  }

  if (!read.ok) {
    // forbidden -> dedicated denied panel; any other read failure -> error state.
    const state = read.error === 'forbidden' ? 'denied' : 'error';
    return <DocumentsScreen state={state} labels={labels} />;
  }

  // Render hint only — the update Server Action re-checks `settings.infra.update`
  // server-side on every save, so this is never client-trusted. Users who can
  // read but not update see the cards read-only with a note (parity with the
  // sibling Company profile screen).
  const canEdit = await canUpdate();

  const settings = read.settings as DocumentSetting[];
  const state = settings.length === 0 ? 'empty' : 'ready';

  return (
    <DocumentsScreen
      settings={settings}
      canEdit={canEdit}
      state={state}
      labels={labels}
      updateDocumentAction={updateDocumentAction}
    />
  );
}

const UPDATE_PERMISSION = 'settings.infra.update';

/**
 * Probe the write permission server-side so the screen can render read-only for
 * users who can read but not update. Mirrors the exact RBAC query the update
 * Server Action enforces; this is purely a render hint (the action re-checks the
 * gate on every save, so it is never client-trusted).
 */
async function canUpdate(): Promise<boolean> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
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
        [userId, orgId, UPDATE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}
