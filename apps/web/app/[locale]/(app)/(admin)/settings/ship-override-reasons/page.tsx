import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { readShippingOverridesSettingsData } from './_actions/shipping-overrides';
import ShipOverrideReasonsScreen, {
  type ShipOverrideReasonsScreenLabels,
} from './ship-override-reasons-screen.client';

export const dynamic = 'force-dynamic';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

async function buildLabels(locale: string): Promise<ShipOverrideReasonsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.shipOverrideReasons' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    exportCsv: t('export_csv'),
    addReason: t('add_reason'),
    reasonCodesSuffix: t('reason_codes_suffix'),
    reasonCodesSubtitle: t('reason_codes_subtitle'),
    reasonColumns: {
      code: t('reason_column_code'),
      label: t('reason_column_label'),
      requiresNote: t('reason_column_requires_note'),
      status: t('reason_column_status'),
    },
    rmaTitle: t('rma_title'),
    rmaSubtitle: t('rma_subtitle'),
    rmaColumns: {
      code: t('rma_column_code'),
      labelEn: t('rma_column_label_en'),
      labelPl: t('rma_column_label_pl'),
      status: t('rma_column_status'),
    },
    statusActive: t('status_active'),
    statusInactive: t('status_inactive'),
    requiresNoteYes: t('requires_note_yes'),
    requiresNoteNo: t('requires_note_no'),
    codesCountSuffix: t('codes_count_suffix'),
    emptyOverrideTypes: t('empty_override_types'),
    emptyReasonCodes: t('empty_reason_codes'),
    emptyRmaCodes: t('empty_rma_codes'),
  };
}

async function resolveCanEdit(): Promise<boolean> {
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
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [userId, orgId, SETTINGS_UPDATE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

export default async function ShipOverrideReasonsSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };

  const [labels, data, canEdit] = await Promise.all([
    buildLabels(locale),
    readShippingOverridesSettingsData(),
    resolveCanEdit(),
  ]);

  return (
    <ShipOverrideReasonsScreen
      overrideTypes={data.override_types}
      selectedOverrideTypeId={data.selected_override_type_id}
      reasonCodes={data.reason_codes}
      rmaReasonCodes={data.rma_reason_codes}
      canEdit={canEdit}
      labels={labels}
    />
  );
}
