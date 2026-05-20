"use client";

import React from "react";
import { Button } from "@monopilot/ui/Button";
import Input from "@monopilot/ui/Input";

type CompanyProfile = {
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
  gs1Prefix: string;
  region: string;
  tier: string;
  seatLimit: number;
};

type SaveCompanyProfileInput = Pick<
  CompanyProfile,
  | "tradingName"
  | "legalName"
  | "vat"
  | "regon"
  | "industry"
  | "street"
  | "city"
  | "zip"
  | "country"
  | "email"
  | "phone"
  | "website"
  | "currency"
  | "timezone"
  | "dateFormat"
  | "gs1Prefix"
>;

type SaveCompanyProfileResult = {
  ok: boolean;
  organization?: CompanyProfile;
  outboxEventType?: string;
  error?: string;
};

type CompanyProfilePageProps = {
  organization?: CompanyProfile;
  canEdit?: boolean;
  state?: "ready" | "loading" | "empty" | "error";
  saveCompanyProfile?: (
    input: SaveCompanyProfileInput,
  ) => Promise<SaveCompanyProfileResult> | SaveCompanyProfileResult;
  uploadLogo?: () => Promise<unknown> | unknown;
};

const fallbackOrganization: CompanyProfile = {
  id: "org-current",
  tradingName: "",
  legalName: "",
  logoInitials: "ORG",
  vat: "",
  regon: "",
  industry: "Meat processing",
  street: "",
  city: "",
  zip: "",
  country: "Poland",
  email: "",
  phone: "",
  website: "",
  currency: "EUR",
  timezone: "Europe/Warsaw",
  dateFormat: "YYYY-MM-DD",
  gs1Prefix: "",
  region: "eu-central",
  tier: "enterprise",
  seatLimit: 0,
};

const industries = ["Meat processing", "Dairy", "Bakery", "Beverage", "Ready meals", "Fish & seafood"];
const countries = ["Poland", "Germany", "Czech Republic", "Slovakia"];
const currencies = ["EUR", "PLN", "USD", "GBP"];
const timezones = ["Europe/Warsaw", "Europe/Berlin", "Europe/London", "UTC"];
const dateFormats = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"];

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
    gs1Prefix: profile.gs1Prefix,
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
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
  disabled?: boolean;
  readOnly?: boolean;
  describedBy?: string;
  onChange?: (value: string) => void;
};

function TextField({ id, label, value, type = "text", disabled, readOnly, describedBy, onChange }: TextFieldProps) {
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
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor={id}>
      {label}
      <select
        aria-label={label}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        data-slot="select"
        disabled={disabled}
        id={id}
        name={label}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children, foot }: { title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section
      aria-labelledby={`company-profile-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="company-profile-section"
      role="region"
    >
      <h2 className="mb-4 text-lg font-semibold" id={`company-profile-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
      {foot ? <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">{foot}</div> : null}
    </section>
  );
}

function CityZipField({
  city,
  zip,
  disabled,
  onCityChange,
  onZipChange,
}: {
  city: string;
  zip: string;
  disabled?: boolean;
  onCityChange: (value: string) => void;
  onZipChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1 text-sm font-medium text-slate-800">
      <span>City / ZIP</span>
      <div className="flex max-w-[420px] gap-2">
        <Input
          aria-label="City"
          className="flex-[2]"
          data-testid="company-city-input"
          disabled={disabled}
          id="company-city"
          name="City"
          type="text"
          value={city}
          onChange={(event) => onCityChange(event.currentTarget.value)}
        />
        <Input
          aria-label="ZIP"
          className="flex-1"
          data-testid="company-zip-input"
          disabled={disabled}
          id="company-zip"
          name="ZIP"
          type="text"
          value={zip}
          onChange={(event) => onZipChange(event.currentTarget.value)}
        />
      </div>
    </div>
  );
}

export default function CompanyProfilePage({
  organization = fallbackOrganization,
  canEdit = false,
  state = "ready",
  saveCompanyProfile,
  uploadLogo,
}: CompanyProfilePageProps) {
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

  if (state === "loading") {
    return (
      <main aria-labelledby="company-profile-heading" className="grid gap-4">
        <div data-testid="company-profile-loading" role="status">
          Loading company profile…
        </div>
      </main>
    );
  }

  if (state === "empty" || !draft.id) {
    return (
      <main aria-labelledby="company-profile-heading" className="grid gap-4">
        <h1 id="company-profile-heading">Company profile</h1>
        <p role="status">No organization profile is available for the current org.</p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main aria-labelledby="company-profile-heading" className="grid gap-4">
        <h1 id="company-profile-heading">Company profile</h1>
        <p role="alert">Company profile could not be loaded.</p>
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
        setMessage(result.outboxEventType ?? "settings.org.updated");
      } else {
        setError(result?.error ?? "Company profile could not be saved.");
      }
    } catch {
      setError("Company profile could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main aria-labelledby="company-profile-heading" className="mx-auto grid max-w-5xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold" id="company-profile-heading">
          Company profile
        </h1>
        <p className="text-sm text-slate-600">Your company details, used across labels, invoices, and exports.</p>
      </header>

      {!canEdit ? (
        <section aria-label="Read-only company profile notice" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <strong>Read-only</strong>
          <p>You need settings.org.update to save company profile changes.</p>
        </section>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      <Section
        title="Identity"
        foot={
          canEdit ? (
            <>
              <Button disabled={!isDirty || isSaving} type="button" onClick={() => setDraft(saved)}>
                Cancel
              </Button>
              <Button disabled={!isDirty || isSaving} type="button" onClick={() => void handleSave()}>
                Save changes
              </Button>
            </>
          ) : null
        }
      >
        <TextField
          id="company-trading-name"
          label="Trading name"
          value={draft.tradingName}
          disabled={controlsDisabled}
          onChange={(value) => updateField("tradingName", value)}
        />
        <TextField
          id="company-legal-name"
          label="Legal name"
          value={draft.legalName}
          disabled={controlsDisabled}
          onChange={(value) => updateField("legalName", value)}
        />
        <div className="grid gap-1 text-sm font-medium text-slate-800">
          <span>Logo</span>
          <div className="flex items-center gap-3">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-md bg-slate-950 text-lg font-bold text-white">
              {draft.logoInitials}
            </div>
            <div>
              <Button disabled={controlsDisabled} type="button" onClick={() => void uploadLogo?.()}>
                Upload new
              </Button>
              <div className="mt-1 text-[11px] text-slate-500">PNG or SVG · max 2MB · 400×400px recommended</div>
            </div>
          </div>
        </div>
        <TextField
          id="company-vat"
          label="VAT / NIP"
          value={draft.vat}
          disabled={controlsDisabled}
          onChange={(value) => updateField("vat", value)}
        />
        <TextField
          id="company-regon"
          label="REGON"
          value={draft.regon}
          disabled={controlsDisabled}
          onChange={(value) => updateField("regon", value)}
        />
        <SelectField
          id="company-industry"
          label="Industry"
          options={industries}
          value={draft.industry}
          disabled={controlsDisabled}
          onChange={(value) => updateField("industry", value)}
        />
        <TextField
          id="company-gs1-prefix"
          label="GS1 prefix"
          value={draft.gs1Prefix}
          disabled={controlsDisabled}
          onChange={(value) => updateField("gs1Prefix", value)}
        />
      </Section>

      <Section title="Registered address">
        <TextField
          id="company-street"
          label="Street"
          value={draft.street}
          disabled={controlsDisabled}
          onChange={(value) => updateField("street", value)}
        />
        <CityZipField
          city={draft.city}
          zip={draft.zip}
          disabled={controlsDisabled}
          onCityChange={(value) => updateField("city", value)}
          onZipChange={(value) => updateField("zip", value)}
        />
        <SelectField
          id="company-country"
          label="Country"
          options={countries}
          value={draft.country}
          disabled={controlsDisabled}
          onChange={(value) => updateField("country", value)}
        />
      </Section>

      <Section title="Contact">
        <TextField
          id="company-email"
          label="Email"
          type="email"
          value={draft.email}
          disabled={controlsDisabled}
          onChange={(value) => updateField("email", value)}
        />
        <TextField
          id="company-phone"
          label="Phone"
          value={draft.phone}
          disabled={controlsDisabled}
          onChange={(value) => updateField("phone", value)}
        />
        <TextField
          id="company-website"
          label="Website"
          value={draft.website}
          disabled={controlsDisabled}
          onChange={(value) => updateField("website", value)}
        />
      </Section>

      <Section title="Locale">
        <SelectField
          id="company-currency"
          label="Default currency"
          options={currencies}
          value={draft.currency}
          disabled={controlsDisabled}
          onChange={(value) => updateField("currency", value)}
        />
        <SelectField
          id="company-timezone"
          label="Timezone"
          options={timezones}
          value={draft.timezone}
          disabled={controlsDisabled}
          onChange={(value) => updateField("timezone", value)}
        />
        <SelectField
          id="company-date-format"
          label="Date format"
          options={dateFormats}
          value={draft.dateFormat}
          disabled={controlsDisabled}
          onChange={(value) => updateField("dateFormat", value)}
        />
        <TextField
          describedBy="region-support-ticket"
          disabled
          id="company-region"
          label="Region"
          readOnly
          value={draft.region}
        />
        <TextField disabled id="company-tier" label="Tier" readOnly value={draft.tier} />
        <TextField disabled id="company-seat-limit" label="Seat limit" readOnly type="number" value={String(draft.seatLimit)} />
        <div id="region-support-ticket" role="tooltip">
          Region change requires support ticket
        </div>
      </Section>

    </main>
  );
}
