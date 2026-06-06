'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import {
  PageHead,
  Section,
  SelectField,
  SettingField,
  SRow,
} from '../_components';

export type CompanyProfile = {
  id: string;
  tradingName: string;
  legalName: string;
  logoInitials: string;
  vat: string;
  regon: string;
  industry: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  region: string;
};

export type SaveCompanyProfileInput = Omit<CompanyProfile, 'id' | 'logoInitials' | 'region'>;

export type SaveCompanyProfileResult = {
  ok: boolean;
  organization?: CompanyProfile;
  outboxEventType?: string;
  error?: string;
};

export type CompanyProfileScreenLabels = {
  title: string;
  subtitle: string;
  loading: string;
  empty: string;
  loadError: string;
  saveError: string;
  saveSuccess: string;
  readOnlyLabel: string;
  readOnlyNotice: string;
  sections: {
    identity: string;
    registeredAddress: string;
    contact: string;
    locale: string;
  };
  fields: {
    tradingName: string;
    legalName: string;
    logo: string;
    vat: string;
    regon: string;
    industry: string;
    street: string;
    cityZip: string;
    city: string;
    zip: string;
    country: string;
    email: string;
    phone: string;
    website: string;
    defaultCurrency: string;
    timezone: string;
    dateFormat: string;
    region: string;
  };
  hints: {
    tradingName: string;
    legalName: string;
    logo: string;
    vat: string;
    defaultCurrency: string;
    upload: string;
    region: string;
  };
  actions: {
    uploadNew: string;
    cancel: string;
    saveChanges: string;
  };
};

export type CompanyProfileScreenProps = {
  organization?: CompanyProfile;
  canEdit?: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  labels?: CompanyProfileScreenLabels;
  saveCompanyProfile?: (input: SaveCompanyProfileInput) => Promise<SaveCompanyProfileResult> | SaveCompanyProfileResult;
  uploadLogo?: () => Promise<unknown> | unknown;
};

export const fallbackOrganization: CompanyProfile = {
  id: 'org-current',
  tradingName: '',
  legalName: '',
  logoInitials: 'ORG',
  vat: '',
  regon: '',
  industry: 'Meat processing',
  street: '',
  city: '',
  zip: '',
  country: 'Poland',
  email: '',
  phone: '',
  website: '',
  currency: 'EUR',
  timezone: 'Europe/Warsaw',
  dateFormat: 'YYYY-MM-DD',
  region: 'eu-central',
};

const defaultIndustries = [
  'Meat processing',
  'Dairy',
  'Bakery',
  'Beverage',
  'Ready meals',
  'Fish & seafood',
  'Produce',
  'Pharmaceuticals',
  'Packaging',
  'Discrete manufacturing',
];
const defaultCountries = [
  'Poland',
  'Germany',
  'Czech Republic',
  'Slovakia',
  'United Kingdom',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'United States',
];
const defaultCurrencies = ['EUR', 'PLN', 'USD', 'GBP', 'CZK', 'RON', 'UAH'];
const defaultTimezones = [
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Prague',
  'Europe/Bucharest',
  'Europe/Kyiv',
  'UTC',
  'America/New_York',
];
const dateFormats = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];

function uniqueOptions(current: string, defaults: string[]) {
  return Array.from(new Set([current, ...defaults].filter(Boolean)));
}

function toSelectOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

function labelsFromTranslations(t: ReturnType<typeof useTranslations>): CompanyProfileScreenLabels {
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
      tradingName: t('hint_trading_name'),
      legalName: t('hint_legal_name'),
      logo: t('hint_logo'),
      vat: t('hint_vat'),
      defaultCurrency: t('hint_default_currency'),
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

function pickEditableFields(profile: CompanyProfile): SaveCompanyProfileInput {
  return {
    tradingName: profile.tradingName,
    legalName: profile.legalName,
    vat: profile.vat,
    regon: profile.regon,
    industry: profile.industry,
    street: profile.street,
    city: profile.city,
    zip: profile.zip,
    country: profile.country,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
    currency: profile.currency,
    timezone: profile.timezone,
    dateFormat: profile.dateFormat,
  };
}

function sameEditableFields(a: CompanyProfile, b: CompanyProfile) {
  const aFields = pickEditableFields(a);
  const bFields = pickEditableFields(b);
  return (Object.keys(aFields) as Array<keyof SaveCompanyProfileInput>).every((key) => aFields[key] === bFields[key]);
}

export default function CompanyProfileScreen(rawProps: CompanyProfileScreenProps = {}) {
  const router = useRouter();
  const translatedLabels = labelsFromTranslations(useTranslations('settings.company_profile'));
  const labels = rawProps.labels ?? translatedLabels;
  const organization = rawProps.organization ?? fallbackOrganization;
  const canEdit = rawProps.canEdit ?? false;
  const state = rawProps.state ?? 'ready';
  const saveCompanyProfile = rawProps.saveCompanyProfile;
  const uploadLogo = rawProps.uploadLogo;
  const [saved, setSaved] = React.useState<CompanyProfile>(() => ({ ...fallbackOrganization, ...organization }));
  const [draft, setDraft] = React.useState<CompanyProfile>(() => ({ ...fallbackOrganization, ...organization }));
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    const next = { ...fallbackOrganization, ...organization };
    setSaved(next);
    setDraft(next);
    setMessage(null);
    setError(null);
  }, [organization]);

  if (state === 'loading') {
    return (
      <main
        aria-label={labels.title}
        className="mx-auto grid max-w-5xl gap-3 p-6"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/org-screens.jsx:3-100"
      >
        <PageHead title={labels.title} sub={labels.subtitle} />
        <div className="sg-section" data-testid="company-profile-loading" role="status">
          <div className="sg-section-body">
            <span className="muted">{labels.loading}</span>
          </div>
        </div>
      </main>
    );
  }

  if (state === 'empty' || !draft.id) {
    return (
      <main
        aria-label={labels.title}
        className="mx-auto grid max-w-5xl gap-3 p-6"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/org-screens.jsx:3-100"
      >
        <PageHead title={labels.title} sub={labels.subtitle} />
        <div className="empty-state card" role="status">
          <div className="empty-state-icon">◆</div>
          <div className="empty-state-body">{labels.empty}</div>
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main
        aria-label={labels.title}
        className="mx-auto grid max-w-5xl gap-3 p-6"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/org-screens.jsx:3-100"
      >
        <PageHead title={labels.title} sub={labels.subtitle} />
        <div className="alert alert-red" role="alert">
          {labels.loadError}
        </div>
      </main>
    );
  }

  const isDirty = !sameEditableFields(draft, saved);
  const controlsDisabled = !canEdit || isSaving;
  const industryOptions = toSelectOptions(uniqueOptions(draft.industry, defaultIndustries));
  const countryOptions = toSelectOptions(uniqueOptions(draft.country, defaultCountries));
  const currencyOptions = toSelectOptions(uniqueOptions(draft.currency, defaultCurrencies));
  const timezoneOptions = toSelectOptions(uniqueOptions(draft.timezone, defaultTimezones));
  const dateFormatOptions = toSelectOptions(dateFormats);

  function updateField<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    if (!canEdit || !isDirty || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const result = await saveCompanyProfile?.(pickEditableFields(draft));
      if (result?.ok) {
        const next = result.organization ? { ...fallbackOrganization, ...result.organization } : draft;
        setSaved(next);
        setDraft(next);
        setMessage(labels.saveSuccess);
        // Re-fetch the server-rendered row so the persisted values are reflected
        // (without this the screen keeps the in-memory draft and the save can
        // look like a no-op to the user).
        router.refresh?.();
      } else {
        setError(labels.saveError);
      }
    } catch {
      setError(labels.saveError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/org-screens.jsx:3-100"
    >
      <PageHead title={labels.title} sub={labels.subtitle} />

      {!canEdit ? (
        <div aria-label={labels.readOnlyLabel} className="alert alert-amber" role="note">
          <div className="alert-title">{labels.readOnlyLabel}</div>
          {labels.readOnlyNotice}
        </div>
      ) : null}

      {message ? (
        <div className="alert alert-green" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-red" role="alert">
          {error}
        </div>
      ) : null}

      <Section
        title={labels.sections.identity}
        foot={
          canEdit ? (
            <>
              <Button className="btn-ghost" disabled={!isDirty || isSaving} type="button" onClick={() => setDraft(saved)}>
                {labels.actions.cancel}
              </Button>
              <Button className="btn-primary" disabled={!isDirty || isSaving} type="button" onClick={() => void handleSave()}>
                {labels.actions.saveChanges}
              </Button>
            </>
          ) : null
        }
      >
        <SettingField
          id="company-trading-name"
          label={labels.fields.tradingName}
          hint={labels.hints.tradingName}
          value={draft.tradingName}
          disabled={controlsDisabled}
          onChange={(value) => updateField('tradingName', value)}
        />
        <SettingField
          id="company-legal-name"
          label={labels.fields.legalName}
          hint={labels.hints.legalName}
          value={draft.legalName}
          disabled={controlsDisabled}
          onChange={(value) => updateField('legalName', value)}
        />
        <SRow label={labels.fields.logo} hint={labels.hints.logo}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center font-bold text-white"
              style={{ background: 'var(--text)', borderRadius: 'var(--radius)', fontSize: 18 }}
            >
              {draft.logoInitials}
            </div>
            <div>
              <Button className="btn-secondary btn-sm" disabled={controlsDisabled} type="button" onClick={() => void uploadLogo?.()}>
                {labels.actions.uploadNew}
              </Button>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {labels.hints.upload}
              </div>
            </div>
          </div>
        </SRow>
        <SettingField
          id="company-vat"
          label={labels.fields.vat}
          hint={labels.hints.vat}
          value={draft.vat}
          disabled={controlsDisabled}
          onChange={(value) => updateField('vat', value)}
        />
        <SettingField
          id="company-regon"
          label={labels.fields.regon}
          value={draft.regon}
          disabled={controlsDisabled}
          onChange={(value) => updateField('regon', value)}
        />
        <SelectField
          id="company-industry"
          label={labels.fields.industry}
          options={industryOptions}
          value={draft.industry}
          disabled={controlsDisabled}
          onChange={(value) => updateField('industry', value)}
        />
      </Section>

      <Section title={labels.sections.registeredAddress}>
        <SettingField
          id="company-street"
          label={labels.fields.street}
          value={draft.street}
          disabled={controlsDisabled}
          onChange={(value) => updateField('street', value)}
        />
        <SRow label={labels.fields.cityZip}>
          <div className="flex gap-2" style={{ maxWidth: 420 }}>
            <input
              aria-label={labels.fields.city}
              className="flex-[2]"
              disabled={controlsDisabled}
              id="company-city"
              name={labels.fields.city}
              type="text"
              value={draft.city}
              onChange={(event) => updateField('city', event.currentTarget.value)}
            />
            <input
              aria-label={labels.fields.zip}
              className="flex-1"
              disabled={controlsDisabled}
              id="company-zip"
              name={labels.fields.zip}
              type="text"
              value={draft.zip}
              onChange={(event) => updateField('zip', event.currentTarget.value)}
            />
          </div>
        </SRow>
        <SelectField
          id="company-country"
          label={labels.fields.country}
          options={countryOptions}
          value={draft.country}
          disabled={controlsDisabled}
          onChange={(value) => updateField('country', value)}
        />
      </Section>

      <Section title={labels.sections.contact}>
        <SettingField
          id="company-email"
          label={labels.fields.email}
          type="email"
          value={draft.email}
          disabled={controlsDisabled}
          onChange={(value) => updateField('email', value)}
        />
        <SettingField
          id="company-phone"
          label={labels.fields.phone}
          value={draft.phone}
          disabled={controlsDisabled}
          onChange={(value) => updateField('phone', value)}
        />
        <SettingField
          id="company-website"
          label={labels.fields.website}
          value={draft.website}
          disabled={controlsDisabled}
          onChange={(value) => updateField('website', value)}
        />
      </Section>

      <Section title={labels.sections.locale}>
        <SelectField
          id="company-currency"
          label={labels.fields.defaultCurrency}
          hint={labels.hints.defaultCurrency}
          options={currencyOptions}
          value={draft.currency}
          disabled={controlsDisabled}
          onChange={(value) => updateField('currency', value)}
        />
        <SelectField
          id="company-timezone"
          label={labels.fields.timezone}
          options={timezoneOptions}
          value={draft.timezone}
          disabled={controlsDisabled}
          onChange={(value) => updateField('timezone', value)}
        />
        <SelectField
          id="company-date-format"
          label={labels.fields.dateFormat}
          options={dateFormatOptions}
          value={draft.dateFormat}
          disabled={controlsDisabled}
          onChange={(value) => updateField('dateFormat', value)}
        />
        <SRow label={labels.fields.region} htmlFor="company-region">
          <input
            aria-describedby="region-support-ticket"
            aria-label={labels.fields.region}
            disabled
            id="company-region"
            name={labels.fields.region}
            readOnly
            type="text"
            value={draft.region}
          />
          <div id="region-support-ticket" role="tooltip" className="sg-hint" style={{ marginTop: 6 }}>
            {labels.hints.region}
          </div>
        </SRow>
      </Section>
    </main>
  );
}
