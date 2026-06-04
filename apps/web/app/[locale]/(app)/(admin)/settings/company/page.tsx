import { getTranslations } from 'next-intl/server';

import CompanyProfileScreen, {
  type CompanyProfileScreenLabels,
} from './company-profile-screen.client';
import { readCompanyProfile, saveCompanyProfile } from './_actions/company-profile';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

async function buildLabels(locale: string): Promise<CompanyProfileScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.company_profile' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    loading: t('loading'),
    empty: t('empty'),
    loadError: t('load_error'),
    saveError: t('save_error'),
    saveSuccess: t('save_success'),
    readOnlyLabel: t('read_only_label'),
    readOnlyNotice: t('read_only_notice'),
    sections: {
      identity: t('section_identity'),
      registeredAddress: t('section_registered_address'),
      contact: t('section_contact'),
      locale: t('section_locale'),
    },
    fields: {
      tradingName: t('field_trading_name'),
      legalName: t('field_legal_name'),
      logo: t('field_logo'),
      vat: t('field_vat'),
      regon: t('field_regon'),
      industry: t('field_industry'),
      street: t('field_street'),
      cityZip: t('field_city_zip'),
      city: t('field_city'),
      zip: t('field_zip'),
      country: t('field_country'),
      email: t('field_email'),
      phone: t('field_phone'),
      website: t('field_website'),
      defaultCurrency: t('field_default_currency'),
      timezone: t('field_timezone'),
      dateFormat: t('field_date_format'),
      region: t('field_region'),
    },
    hints: {
      upload: t('hint_upload'),
      region: t('region_tooltip'),
    },
    actions: {
      uploadNew: t('action_upload_new'),
      cancel: t('action_cancel'),
      saveChanges: t('action_save_changes'),
    },
  };
}

export default async function CompanyProfilePage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const [labels, result] = await Promise.all([buildLabels(locale), readCompanyProfile()]);

  if (result.state === 'ready') {
    return (
      <CompanyProfileScreen
        organization={result.organization}
        canEdit={result.canEdit}
        labels={labels}
        saveCompanyProfile={saveCompanyProfile}
      />
    );
  }

  return <CompanyProfileScreen state={result.state} canEdit={result.canEdit} labels={labels} />;
}
