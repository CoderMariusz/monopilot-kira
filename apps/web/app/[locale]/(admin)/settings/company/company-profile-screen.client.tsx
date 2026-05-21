'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

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

const industries = ['Meat processing', 'Dairy', 'Bakery', 'Beverage', 'Ready meals', 'Fish & seafood'];
const countries = ['Poland', 'Germany', 'Czech Republic', 'Slovakia'];
const currencies = ['EUR', 'PLN', 'USD', 'GBP'];
const timezones = ['Europe/Warsaw', 'Europe/Berlin', 'Europe/London', 'UTC'];
const dateFormats = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];

function labelsFromTranslations(t: ReturnType<typeof useTranslations>): CompanyProfileScreenLabels {
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    loading: t('loading'),
    empty: t('empty'),
    loadError: t('load_error'),
    saveError: t('save_error'),
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

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  type?: React.InputHTMLAttributes<HTMLInputElement>['type'];
  disabled?: boolean;
  readOnly?: boolean;
  describedBy?: string;
  onChange?: (value: string) => void;
};

function TextField({ id, label, value, type = 'text', disabled, readOnly, describedBy, onChange }: TextFieldProps) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor={id}>
      {label}
      <Input
        aria-describedby={describedBy}
        aria-label={label}
        disabled={disabled}
        id={id}
        name={label}
        readOnly={readOnly}
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </label>
  );
}

type SelectFieldProps = {
  id: string;
  label: string;
  options: string[];
  value: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

function SelectField({ id, label, options, value, disabled, onChange }: SelectFieldProps) {
  const optionObjects = options.map((option) => ({ value: option, label: option }));
  const trigger = React.createElement(
    SelectTrigger as any,
    { id, name: label, value, 'aria-label': label, className: 'min-w-48' },
    React.createElement(SelectValue as any, { placeholder: label }),
  );
  const content = React.createElement(
    SelectContent as any,
    null,
    options.map((option) => React.createElement(SelectItem as any, { key: option, value: option, disabled }, option)),
  );

  return (
    <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor={id}>
      {label}
      {React.createElement(
        Select as any,
        { value, onValueChange: onChange, options: optionObjects, disabled, id, name: label },
        trigger,
        content,
      )}
    </label>
  );
}

function Section({ title, children, foot }: { title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  const id = `company-profile-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="company-profile-section"
      role="region"
    >
      <h2 className="mb-4 text-lg font-semibold" id={id}>
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
      {foot ? <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">{foot}</div> : null}
    </section>
  );
}

function CityZipField({
  labels,
  city,
  zip,
  disabled,
  onCityChange,
  onZipChange,
}: {
  labels: CompanyProfileScreenLabels;
  city: string;
  zip: string;
  disabled?: boolean;
  onCityChange: (value: string) => void;
  onZipChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1 text-sm font-medium text-slate-800">
      <span>{labels.fields.cityZip}</span>
      <div className="flex max-w-[420px] gap-2">
        <Input
          aria-label={labels.fields.city}
          className="flex-[2]"
          disabled={disabled}
          id="company-city"
          name={labels.fields.city}
          type="text"
          value={city}
          onChange={(event) => onCityChange(event.currentTarget.value)}
        />
        <Input
          aria-label={labels.fields.zip}
          className="flex-1"
          disabled={disabled}
          id="company-zip"
          name={labels.fields.zip}
          type="text"
          value={zip}
          onChange={(event) => onZipChange(event.currentTarget.value)}
        />
      </div>
    </div>
  );
}

export default function CompanyProfileScreen(rawProps: CompanyProfileScreenProps = {}) {
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
      <main aria-labelledby="company-profile-heading" className="grid gap-4">
        <div data-testid="company-profile-loading" role="status">
          {labels.loading}
        </div>
      </main>
    );
  }

  if (state === 'empty' || !draft.id) {
    return (
      <main aria-labelledby="company-profile-heading" className="grid gap-4">
        <h1 id="company-profile-heading">{labels.title}</h1>
        <p role="status">{labels.empty}</p>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main aria-labelledby="company-profile-heading" className="grid gap-4">
        <h1 id="company-profile-heading">{labels.title}</h1>
        <p role="alert">{labels.loadError}</p>
      </main>
    );
  }

  const isDirty = !sameEditableFields(draft, saved);
  const controlsDisabled = !canEdit || isSaving;

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
        setMessage(result.outboxEventType ?? 'settings.org.updated');
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
    <main aria-labelledby="company-profile-heading" className="mx-auto grid max-w-5xl gap-6 p-6">
      <header className="grid gap-1" data-region="page-head">
        <h1 className="text-2xl font-semibold" id="company-profile-heading">
          {labels.title}
        </h1>
        <p className="text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      {!canEdit ? (
        <section aria-label={labels.readOnlyLabel} className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <strong>{labels.readOnlyLabel}</strong>
          <p>{labels.readOnlyNotice}</p>
        </section>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      <Section
        title={labels.sections.identity}
        foot={
          canEdit ? (
            <>
              <Button disabled={!isDirty || isSaving} type="button" onClick={() => setDraft(saved)}>
                {labels.actions.cancel}
              </Button>
              <Button disabled={!isDirty || isSaving} type="button" onClick={() => void handleSave()}>
                {labels.actions.saveChanges}
              </Button>
            </>
          ) : null
        }
      >
        <TextField
          id="company-trading-name"
          label={labels.fields.tradingName}
          value={draft.tradingName}
          disabled={controlsDisabled}
          onChange={(value) => updateField('tradingName', value)}
        />
        <TextField
          id="company-legal-name"
          label={labels.fields.legalName}
          value={draft.legalName}
          disabled={controlsDisabled}
          onChange={(value) => updateField('legalName', value)}
        />
        <div className="grid gap-1 text-sm font-medium text-slate-800">
          <span>{labels.fields.logo}</span>
          <div className="flex items-center gap-3">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-md bg-slate-950 text-lg font-bold text-white">
              {draft.logoInitials}
            </div>
            <div>
              <Button disabled={controlsDisabled} type="button" onClick={() => void uploadLogo?.()}>
                {labels.actions.uploadNew}
              </Button>
              <div className="mt-1 text-[11px] text-slate-500">{labels.hints.upload}</div>
            </div>
          </div>
        </div>
        <TextField
          id="company-vat"
          label={labels.fields.vat}
          value={draft.vat}
          disabled={controlsDisabled}
          onChange={(value) => updateField('vat', value)}
        />
        <TextField
          id="company-regon"
          label={labels.fields.regon}
          value={draft.regon}
          disabled={controlsDisabled}
          onChange={(value) => updateField('regon', value)}
        />
        <SelectField
          id="company-industry"
          label={labels.fields.industry}
          options={industries}
          value={draft.industry}
          disabled={controlsDisabled}
          onChange={(value) => updateField('industry', value)}
        />
      </Section>

      <Section title={labels.sections.registeredAddress}>
        <TextField
          id="company-street"
          label={labels.fields.street}
          value={draft.street}
          disabled={controlsDisabled}
          onChange={(value) => updateField('street', value)}
        />
        <CityZipField
          labels={labels}
          city={draft.city}
          zip={draft.zip}
          disabled={controlsDisabled}
          onCityChange={(value) => updateField('city', value)}
          onZipChange={(value) => updateField('zip', value)}
        />
        <SelectField
          id="company-country"
          label={labels.fields.country}
          options={countries}
          value={draft.country}
          disabled={controlsDisabled}
          onChange={(value) => updateField('country', value)}
        />
      </Section>

      <Section title={labels.sections.contact}>
        <TextField
          id="company-email"
          label={labels.fields.email}
          type="email"
          value={draft.email}
          disabled={controlsDisabled}
          onChange={(value) => updateField('email', value)}
        />
        <TextField
          id="company-phone"
          label={labels.fields.phone}
          value={draft.phone}
          disabled={controlsDisabled}
          onChange={(value) => updateField('phone', value)}
        />
        <TextField
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
          options={currencies}
          value={draft.currency}
          disabled={controlsDisabled}
          onChange={(value) => updateField('currency', value)}
        />
        <SelectField
          id="company-timezone"
          label={labels.fields.timezone}
          options={timezones}
          value={draft.timezone}
          disabled={controlsDisabled}
          onChange={(value) => updateField('timezone', value)}
        />
        <SelectField
          id="company-date-format"
          label={labels.fields.dateFormat}
          options={dateFormats}
          value={draft.dateFormat}
          disabled={controlsDisabled}
          onChange={(value) => updateField('dateFormat', value)}
        />
        <TextField
          id="company-region"
          label={labels.fields.region}
          value={draft.region}
          disabled
          readOnly
          describedBy="region-support-ticket"
        />
        <div id="region-support-ticket" role="tooltip" className="text-xs text-slate-500">
          {labels.hints.region}
        </div>
      </Section>
    </main>
  );
}
