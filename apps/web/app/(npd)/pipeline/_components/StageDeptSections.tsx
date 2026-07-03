'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';

import { saveStageDeptField } from '../_actions/save-stage-dept-field';
import type { Dept } from '../../fa/actions/get-required-fields-for-dept';
import type { StageDeptField, StageDeptSectionsResult } from '../_actions/load-stage-dept-sections.types';
import { StageDeptCloseButton } from './StageDeptCloseButton';

export type StageDeptSectionLabels = {
  noFgLinked: string;
  readOnly: string;
  save: string;
  saved: string;
  saveFailed: string;
  selectPlaceholder: string;
  booleanYes: string;
  booleanNo: string;
};

const DEFAULT_LABELS: StageDeptSectionLabels = {
  noFgLinked:
    'No Finished Good linked yet - values are saved on the project and will transfer to the FG automatically when it is created at gate G3.',
  readOnly: 'Read-only',
  save: 'Save',
  saved: 'Saved',
  saveFailed: 'Save failed',
  selectPlaceholder: 'Select...',
  booleanYes: 'Yes',
  booleanNo: 'No',
};

type StageDeptSectionsProps = {
  projectId: string;
  stage: string;
  data: StageDeptSectionsResult;
  /** Label template for close button, e.g. "Close {dept} section". */
  closeSectionLabel?: string;
  /** Optional i18n labels; omitted keys fall back to English defaults. */
  labels?: Partial<StageDeptSectionLabels>;
};

type Drafts = Record<string, string>;

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function inputType(field: StageDeptField): string {
  if (field.dataType === 'number' || field.dataType === 'integer') return 'number';
  if (field.dataType === 'date' || field.dataType === 'datetime') return 'date';
  return 'text';
}

function parseDraft(field: StageDeptField, value: string): unknown {
  if (value === '') return null;
  if (field.dataType === 'number' || field.dataType === 'integer') return value;
  if (field.dataType === 'boolean') return value === 'true';
  return value;
}

function isMultiline(field: StageDeptField): boolean {
  return field.dataType === 'json' || /notes|comment|description|requirements|claims/i.test(field.code);
}

function FieldEditor({
  field,
  value,
  disabled,
  labels,
  onChange,
}: {
  field: StageDeptField;
  value: string;
  disabled: boolean;
  labels: StageDeptSectionLabels;
  onChange: (next: string) => void;
}) {
  const id = `stage-dept-${field.deptCode}-${field.code}`;
  const label = (
    <>
      {field.label}
      {field.required ? <span aria-hidden="true"> *</span> : null}
    </>
  );

  if (field.dataType === 'dropdown' || field.dataType === 'boolean') {
    const options =
      field.dataType === 'boolean'
        ? [
            { value: 'true', label: labels.booleanYes },
            { value: 'false', label: labels.booleanNo },
          ]
        : (field.dropdownOptions ?? []).map((option) => ({ value: option, label: option }));
    return (
      <div className="grid gap-1" data-field={field.code}>
        <label id={`${id}-label`} className="text-xs font-medium text-slate-700">
          {label}
        </label>
        <Select
          id={id}
          name={field.code}
          value={value}
          onValueChange={onChange}
          options={options}
          disabled={disabled}
          aria-labelledby={`${id}-label`}
        >
          <SelectTrigger aria-label={field.label}>
            <SelectValue placeholder={labels.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (isMultiline(field)) {
    return (
      <div className="grid gap-1" data-field={field.code}>
        <label htmlFor={id} className="text-xs font-medium text-slate-700">
          {label}
        </label>
        <Textarea
          id={id}
          name={field.code}
          value={value}
          readOnly={disabled}
          aria-readonly={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="min-h-24 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-1" data-field={field.code}>
      <label htmlFor={id} className="text-xs font-medium text-slate-700">
        {label}
      </label>
      <Input
        id={id}
        name={field.code}
        type={inputType(field)}
        value={value}
        readOnly={disabled}
        aria-readonly={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={
          field.auto
            ? 'rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-sm'
            : 'rounded-md border border-slate-200 px-2 py-1.5 text-sm'
        }
      />
    </div>
  );
}

export function StageDeptSections({
  projectId,
  stage,
  data,
  closeSectionLabel,
  labels: labelsProp,
}: StageDeptSectionsProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const initialDrafts = useMemo(() => {
    const next: Drafts = {};
    for (const section of data.sections) {
      for (const field of section.fields) next[field.code] = stringifyValue(field.value);
    }
    return next;
  }, [data.sections]);
  const [drafts, setDrafts] = useState<Drafts>(initialDrafts);
  const [feedback, setFeedback] = useState<Record<string, 'saved' | 'error'>>({});
  const [isPending, startTransition] = useTransition();

  if (data.sections.length === 0) return null;

  const saveField = (field: StageDeptField) => {
    const value = drafts[field.code] ?? '';
    startTransition(async () => {
      try {
        await saveStageDeptField({
          projectId,
          productCode: data.productCode,
          fieldCode: field.code,
          value: parseDraft(field, value),
        });
        setFeedback((prev) => ({ ...prev, [field.code]: 'saved' }));
      } catch {
        setFeedback((prev) => ({ ...prev, [field.code]: 'error' }));
      }
    });
  };

  const closeLabel = closeSectionLabel ?? 'Close {dept} section';

  return (
    <section className="mt-6 space-y-4" data-testid={`stage-dept-sections-${stage}`}>
      {data.no_fg_linked ? (
        <div
          role="note"
          data-testid="stage-dept-no-fg-linked-banner"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        >
          {labels.noFgLinked}
        </div>
      ) : null}

      {data.sections.map((section) => (
        <Card key={section.key} data-testid={`stage-dept-section-${section.key}`}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{section.label}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {data.productCode && section.allRequiredFilled && !section.readOnly ? (
                  <StageDeptCloseButton
                    productCode={data.productCode}
                    dept={section.closeDeptValue as Dept}
                    deptLabel={section.label}
                    closeSectionLabel={closeLabel}
                    canClose={section.allRequiredFilled === true}
                  />
                ) : null}
                {section.readOnly ? (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    {labels.readOnly}
                  </span>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {section.fields.map((field) => {
                const disabled = section.readOnly || field.readOnly || isPending;
                return (
                  <div key={field.code} className="space-y-2">
                    <FieldEditor
                      field={field}
                      value={drafts[field.code] ?? ''}
                      disabled={disabled}
                      labels={labels}
                      onChange={(next) => setDrafts((prev) => ({ ...prev, [field.code]: next }))}
                    />
                    {!section.readOnly && !field.readOnly ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          disabled={isPending || (drafts[field.code] ?? '') === stringifyValue(field.value)}
                          onClick={() => saveField(field)}
                          className="px-3 py-1.5 text-xs"
                        >
                          {labels.save}
                        </Button>
                        {feedback[field.code] === 'saved' ? (
                          <span className="text-xs text-green-700">{labels.saved}</span>
                        ) : null}
                        {feedback[field.code] === 'error' ? (
                          <span className="text-xs text-red-700">{labels.saveFailed}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export default StageDeptSections;
