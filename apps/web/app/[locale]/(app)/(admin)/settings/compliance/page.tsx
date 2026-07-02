import { getTranslations } from 'next-intl/server';

import ComplianceProfileScreen, {
  type ComplianceProfileScreenLabels,
} from './compliance-profile-screen.client';
import {
  getComplianceProfile,
  upsertComplianceProfile,
} from './_actions/compliance-profile-actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

async function buildLabels(locale: string): Promise<ComplianceProfileScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.compliance' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    loading: t('loading'),
    loadError: t('load_error'),
    saveError: t('save_error'),
    saveSuccess: t('save_success'),
    readOnlyLabel: t('read_only_label'),
    readOnlyNotice: t('read_only_notice'),
    sections: {
      certification: t('section_certification'),
      audits: t('section_audits'),
      registrations: t('section_registrations'),
    },
    fields: {
      brcgsSiteCode: t('field_brcgs_site_code'),
      certificationBody: t('field_certification_body'),
      certificationGrade: t('field_certification_grade'),
      lastAuditDate: t('field_last_audit_date'),
      nextAuditDate: t('field_next_audit_date'),
      registrationName: t('field_registration_name'),
      registrationNumber: t('field_registration_number'),
    },
    hints: {
      brcgsSiteCode: t('hint_brcgs_site_code'),
      certificationBody: t('hint_certification_body'),
      certificationGrade: t('hint_certification_grade'),
      registrations: t('hint_registrations'),
    },
    actions: {
      cancel: t('action_cancel'),
      saveChanges: t('action_save_changes'),
      addRegistration: t('action_add_registration'),
      removeRegistration: t('action_remove_registration'),
    },
    emptyRegistrations: t('empty_registrations'),
  };
}

export default async function ComplianceProfilePage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const [labels, result] = await Promise.all([buildLabels(locale), getComplianceProfile()]);

  if (result.state === 'ready') {
    return (
      <ComplianceProfileScreen
        profile={result.profile}
        canEdit={result.canEdit}
        labels={labels}
        upsertComplianceProfile={upsertComplianceProfile}
      />
    );
  }

  return <ComplianceProfileScreen state="error" canEdit={false} labels={labels} />;
}
