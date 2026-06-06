'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="ff">
      <label htmlFor={id}>{label}</label>
      <Input
        aria-describedby={describedBy}
        aria-label={label}
        className="form-input"
        disabled={disabled}
        id={id}
        name={label}
        readOnly={readOnly}
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </div>
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
    <div className="ff">
      <label htmlFor={id}>{label}</label>
      {React.createElement(
        Select as any,
        { value, onValueChange: onChange, options: optionObjects, disabled, id, name: label },
        trigger,
        content,
      )}
    </div>
  );
}

function Section({ title, children, foot }: { title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  const id = `company-profile-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className="card"
      data-testid="company-profile-section"
      role="region"
    >
      <h2 className="card-title mb-4" id={id}>
        {title}
      </h2>
      <div className="grid gap-3">{children}</div>
      {foot ? (
        <div
          className="mt-4 flex justify-end gap-2 pt-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {foot}
        </div>
      ) : null}
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
    <div className="ff">
      <span
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--muted)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 5,
        }}
      >
        {labels.fields.cityZip}
      </span>
      <div className="flex max-w-[420px] gap-2">
        <Input
          aria-label={labels.fields.city}
          className="form-input flex-[2]"
          disabled={disabled}
          id="company-city"
          name={labels.fields.city}
          type="text"
          value={city}
          onChange={(event) => onCityChange(event.currentTarget.value)}
        />
        <Input
          aria-label={labels.fields.zip}
          className="form-input flex-1"
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
      <main aria-labelledby="company-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6">
        <h1 className="page-title" id="company-profile-heading">
          {labels.title}
        </h1>
        <div className="card" data-testid="company-profile-loading" role="status">
          <span className="muted">{labels.loading}</span>
        </div>
      </main>
    );
  }

  if (state === 'empty' || !draft.id) {
    return (
      <main aria-labelledby="company-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6">
        <h1 className="page-title" id="company-profile-heading">
          {labels.title}
        </h1>
        <div className="empty-state card" role="status">
          <div className="empty-state-icon">◆</div>
          <div className="empty-state-body">{labels.empty}</div>
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main aria-labelledby="company-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6">
        <h1 className="page-title" id="company-profile-heading">
          {labels.title}
        </h1>
        <div className="alert alert-red" role="alert">
          {labels.loadError}
        </div>
      </main>
    );
  }

  const isDirty = !sameEditableFields(draft, saved);
  const controlsDisabled = !canEdit || isSaving;
  const industryOptions = uniqueOptions(draft.industry, defaultIndustries);
  const countryOptions = uniqueOptions(draft.country, defaultCountries);
  const currencyOptions = uniqueOptions(draft.currency, defaultCurrencies);
  const timezoneOptions = uniqueOptions(draft.timezone, defaultTimezones);

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
    <main aria-labelledby="company-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6">
      <header className="grid gap-1" data-region="page-head">
        <h1 className="page-title" id="company-profile-heading">
          {labels.title}
        </h1>
        <p className="muted text-sm">{labels.subtitle}</p>
      </header>

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
        <div className="ff">
          <label>{labels.fields.logo}</label>
          <div className="flex items-center gap-3">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center text-lg font-bold text-white"
              style={{ background: 'var(--text)', borderRadius: 'var(--radius)' }}
            >
              {draft.logoInitials}
            </div>
            <div>
              <Button className="btn-secondary btn-sm" disabled={controlsDisabled} type="button" onClick={() => void uploadLogo?.()}>
                {labels.actions.uploadNew}
              </Button>
              <div className="ff-help mt-1">{labels.hints.upload}</div>
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
          options={industryOptions}
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
          options={countryOptions}
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
        <div id="region-support-ticket" role="tooltip" className="ff-help">
          {labels.hints.region}
        </div>
      </Section>
    </main>
  );
}
