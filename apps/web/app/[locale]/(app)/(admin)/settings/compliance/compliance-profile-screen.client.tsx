'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import {
  PageHead,
  Section,
  SettingField,
  SRow,
} from '../_components';
import type {
  ComplianceProfile,
  ComplianceRegistrations,
  UpsertComplianceProfileInput,
  UpsertComplianceProfileResult,
} from './_actions/compliance-profile.types';

export type RegistrationRow = { key: string; value: string };

export type ComplianceProfileScreenLabels = {
  title: string;
  subtitle: string;
  loading: string;
  loadError: string;
  saveError: string;
  saveSuccess: string;
  readOnlyLabel: string;
  readOnlyNotice: string;
  sections: {
    certification: string;
    audits: string;
    registrations: string;
  };
  fields: {
    brcgsSiteCode: string;
    certificationBody: string;
    certificationGrade: string;
    lastAuditDate: string;
    nextAuditDate: string;
    registrationName: string;
    registrationNumber: string;
  };
  hints: {
    brcgsSiteCode: string;
    certificationBody: string;
    certificationGrade: string;
    registrations: string;
  };
  actions: {
    cancel: string;
    saveChanges: string;
    addRegistration: string;
    removeRegistration: string;
  };
  emptyRegistrations: string;
};

export type ComplianceProfileScreenProps = {
  profile?: ComplianceProfile | null;
  canEdit?: boolean;
  state?: 'ready' | 'loading' | 'error';
  labels?: ComplianceProfileScreenLabels;
  upsertComplianceProfile?: (
    input: UpsertComplianceProfileInput,
  ) => Promise<UpsertComplianceProfileResult> | UpsertComplianceProfileResult;
};

const emptyProfile: ComplianceProfile = {
  orgId: '',
  brcgsSiteCode: '',
  certificationBody: '',
  certificationGrade: '',
  lastAuditDate: null,
  nextAuditDate: null,
  registrations: {},
};

function registrationsToRows(registrations: ComplianceRegistrations): RegistrationRow[] {
  const entries = Object.entries(registrations);
  if (entries.length === 0) return [{ key: '', value: '' }];
  return entries.map(([key, value]) => ({ key, value }));
}

function rowsToRegistrations(rows: RegistrationRow[]): ComplianceRegistrations {
  const out: ComplianceRegistrations = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function pickEditableFields(profile: ComplianceProfile): UpsertComplianceProfileInput {
  return {
    brcgsSiteCode: profile.brcgsSiteCode,
    certificationBody: profile.certificationBody,
    certificationGrade: profile.certificationGrade,
    lastAuditDate: profile.lastAuditDate,
    nextAuditDate: profile.nextAuditDate,
    registrations: profile.registrations,
  };
}

function sameEditableFields(a: ComplianceProfile, b: ComplianceProfile) {
  const aFields = pickEditableFields(a);
  const bFields = pickEditableFields(b);
  return JSON.stringify(aFields) === JSON.stringify(bFields);
}

export default function ComplianceProfileScreen(rawProps: ComplianceProfileScreenProps = {}) {
  const router = useRouter();
  const t = useTranslations('settings.compliance');
  const labels = rawProps.labels;
  const resolvedLabels: ComplianceProfileScreenLabels = labels ?? {
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

  const canEdit = rawProps.canEdit ?? false;
  const state = rawProps.state ?? 'ready';
  const upsertComplianceProfile = rawProps.upsertComplianceProfile;
  const initial = rawProps.profile ?? emptyProfile;

  const [saved, setSaved] = React.useState<ComplianceProfile>(() => ({ ...emptyProfile, ...initial }));
  const [draft, setDraft] = React.useState<ComplianceProfile>(() => ({ ...emptyProfile, ...initial }));
  const [registrationRows, setRegistrationRows] = React.useState<RegistrationRow[]>(() =>
    registrationsToRows(initial.registrations),
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    const next = { ...emptyProfile, ...rawProps.profile };
    setSaved(next);
    setDraft(next);
    setRegistrationRows(registrationsToRows(next.registrations));
    setMessage(null);
    setError(null);
  }, [rawProps.profile]);

  if (state === 'loading') {
    return (
      <main aria-label={resolvedLabels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
        <PageHead title={resolvedLabels.title} sub={resolvedLabels.subtitle} />
        <div className="sg-section" data-testid="compliance-profile-loading" role="status">
          <div className="sg-section-body">
            <span className="muted">{resolvedLabels.loading}</span>
          </div>
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main aria-label={resolvedLabels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
        <PageHead title={resolvedLabels.title} sub={resolvedLabels.subtitle} />
        <div className="alert alert-red" role="alert">
          {resolvedLabels.loadError}
        </div>
      </main>
    );
  }

  const draftWithRegistrations: ComplianceProfile = {
    ...draft,
    registrations: rowsToRegistrations(registrationRows),
  };
  const isDirty = !sameEditableFields(draftWithRegistrations, saved);
  const controlsDisabled = !canEdit || isSaving;

  function updateField<K extends keyof ComplianceProfile>(key: K, value: ComplianceProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  function updateRegistrationRow(index: number, patch: Partial<RegistrationRow>) {
    setRegistrationRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setMessage(null);
    setError(null);
  }

  function addRegistrationRow() {
    setRegistrationRows((rows) => [...rows, { key: '', value: '' }]);
  }

  function removeRegistrationRow(index: number) {
    setRegistrationRows((rows) => (rows.length <= 1 ? [{ key: '', value: '' }] : rows.filter((_, i) => i !== index)));
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    if (!canEdit || !isDirty || isSaving) return;
    setIsSaving(true);
    setError(null);

    const payload = pickEditableFields({
      ...draft,
      registrations: rowsToRegistrations(registrationRows),
    });

    try {
      const result = await upsertComplianceProfile?.(payload);
      if (result?.ok) {
        const next = result.profile;
        setSaved(next);
        setDraft(next);
        setRegistrationRows(registrationsToRows(next.registrations));
        setMessage(resolvedLabels.saveSuccess);
        router.refresh?.();
      } else if (result?.error === 'forbidden') {
        setError(resolvedLabels.readOnlyNotice);
      } else {
        setError(resolvedLabels.saveError);
      }
    } catch {
      setError(resolvedLabels.saveError);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setDraft(saved);
    setRegistrationRows(registrationsToRows(saved.registrations));
    setMessage(null);
    setError(null);
  }

  const sectionFoot = canEdit ? (
    <>
      <Button className="btn-ghost" disabled={!isDirty || isSaving} type="button" onClick={handleCancel}>
        {resolvedLabels.actions.cancel}
      </Button>
      <Button className="btn-primary" disabled={!isDirty || isSaving} type="button" onClick={() => void handleSave()}>
        {resolvedLabels.actions.saveChanges}
      </Button>
    </>
  ) : null;

  return (
    <main aria-label={resolvedLabels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
      <PageHead title={resolvedLabels.title} sub={resolvedLabels.subtitle} />

      {!canEdit ? (
        <div aria-label={resolvedLabels.readOnlyLabel} className="alert alert-amber" role="note">
          <div className="alert-title">{resolvedLabels.readOnlyLabel}</div>
          {resolvedLabels.readOnlyNotice}
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

      <Section title={resolvedLabels.sections.certification} foot={sectionFoot}>
        <SettingField
          id="compliance-brcgs-site-code"
          label={resolvedLabels.fields.brcgsSiteCode}
          hint={resolvedLabels.hints.brcgsSiteCode}
          value={draft.brcgsSiteCode}
          disabled={controlsDisabled}
          onChange={(value) => updateField('brcgsSiteCode', value)}
        />
        <SettingField
          id="compliance-certification-body"
          label={resolvedLabels.fields.certificationBody}
          hint={resolvedLabels.hints.certificationBody}
          value={draft.certificationBody}
          disabled={controlsDisabled}
          onChange={(value) => updateField('certificationBody', value)}
        />
        <SettingField
          id="compliance-certification-grade"
          label={resolvedLabels.fields.certificationGrade}
          hint={resolvedLabels.hints.certificationGrade}
          value={draft.certificationGrade}
          disabled={controlsDisabled}
          onChange={(value) => updateField('certificationGrade', value)}
        />
      </Section>

      <Section title={resolvedLabels.sections.audits}>
        <SettingField
          id="compliance-last-audit-date"
          label={resolvedLabels.fields.lastAuditDate}
          type="date"
          value={draft.lastAuditDate ?? ''}
          disabled={controlsDisabled}
          onChange={(value) => updateField('lastAuditDate', value || null)}
        />
        <SettingField
          id="compliance-next-audit-date"
          label={resolvedLabels.fields.nextAuditDate}
          type="date"
          value={draft.nextAuditDate ?? ''}
          disabled={controlsDisabled}
          onChange={(value) => updateField('nextAuditDate', value || null)}
        />
      </Section>

      <Section title={resolvedLabels.sections.registrations}>
        <SRow label={resolvedLabels.fields.registrationName} hint={resolvedLabels.hints.registrations}>
          <div className="grid gap-2">
            {registrationRows.map((row, index) => (
              <div key={`registration-${index}`} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={resolvedLabels.fields.registrationName}
                  className="sg-field-input"
                  disabled={controlsDisabled}
                  placeholder={resolvedLabels.fields.registrationName}
                  value={row.key}
                  onChange={(event) => updateRegistrationRow(index, { key: event.currentTarget.value })}
                />
                <input
                  aria-label={resolvedLabels.fields.registrationNumber}
                  className="sg-field-input"
                  disabled={controlsDisabled}
                  placeholder={resolvedLabels.fields.registrationNumber}
                  value={row.value}
                  onChange={(event) => updateRegistrationRow(index, { value: event.currentTarget.value })}
                />
                {canEdit ? (
                  <Button
                    className="btn-ghost btn-sm"
                    disabled={controlsDisabled}
                    type="button"
                    onClick={() => removeRegistrationRow(index)}
                  >
                    {resolvedLabels.actions.removeRegistration}
                  </Button>
                ) : null}
              </div>
            ))}
            {registrationRows.every((row) => !row.key && !row.value) ? (
              <span className="muted">{resolvedLabels.emptyRegistrations}</span>
            ) : null}
            {canEdit ? (
              <Button className="btn-secondary btn-sm" disabled={controlsDisabled} type="button" onClick={addRegistrationRow}>
                {resolvedLabels.actions.addRegistration}
              </Button>
            ) : null}
          </div>
        </SRow>
      </Section>
    </main>
  );
}
