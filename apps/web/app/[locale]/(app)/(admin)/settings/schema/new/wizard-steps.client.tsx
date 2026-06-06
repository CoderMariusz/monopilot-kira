'use client';

/**
 * SET-031 — Column Edit Wizard rich step islands.
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/settings/schema-wizard.jsx:58-105 (type cards + validators)
 *   schema-wizard.jsx:182-310 (Step3Type cards, Step4Validation rich rules)
 * These client islands fill the Wave-3 MAJOR_GAP: Step 3 flat radios → 6 rich
 * type CARDS (icon + description); Step 4 minimal checkboxes → regex live-preview,
 * range validator, dropdown_source selector, unique_per_org toggle.
 * They write their values into the server-navigated step form via hidden inputs
 * so the existing GET-based wizard flow is preserved.
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Switch } from '@monopilot/ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

type TypeCardLabels = {
  text: string; textDesc: string;
  number: string; numberDesc: string;
  date: string; dateDesc: string;
  enum: string; enumDesc: string;
  formula: string; formulaDesc: string;
  relation: string; relationDesc: string;
};

const TYPE_META: Array<{ code: string; icon: string; labelKey: keyof TypeCardLabels; descKey: keyof TypeCardLabels }> = [
  { code: 'text', icon: 'Aa', labelKey: 'text', descKey: 'textDesc' },
  { code: 'number', icon: '#', labelKey: 'number', descKey: 'numberDesc' },
  { code: 'date', icon: '▦', labelKey: 'date', descKey: 'dateDesc' },
  { code: 'enum', icon: '≣', labelKey: 'enum', descKey: 'enumDesc' },
  { code: 'formula', icon: 'ƒ', labelKey: 'formula', descKey: 'formulaDesc' },
  { code: 'relation', icon: '⇄', labelKey: 'relation', descKey: 'relationDesc' },
];

export function TypeCards({
  name,
  defaultValue,
  labels,
}: {
  name: string;
  defaultValue: string;
  labels: TypeCardLabels;
}) {
  const [value, setValue] = React.useState(defaultValue || '');
  return (
    <div role="radiogroup" aria-label="Data type" className="schema-column-wizard__type-grid grid gap-2.5 md:grid-cols-2">
      <input type="hidden" name={name} value={value} />
      {TYPE_META.map((t) => {
        const on = value === t.code;
        return (
          <label
            key={t.code}
            className={['sg-radio-card schema-column-wizard__type-card', on ? 'is-selected' : ''].filter(Boolean).join(' ')}
            data-selected={on || undefined}
            data-type={t.code}
          >
            <input
              type="radio"
              name={`${name}__radio`}
              value={t.code}
              checked={on}
              onChange={() => setValue(t.code)}
              className="sr-only"
            />
            <span className="schema-column-wizard__type-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="schema-column-wizard__type-body">
              <span className="schema-column-wizard__type-label font-semibold">{labels[t.labelKey]}</span>
              <span className="schema-column-wizard__type-desc muted block text-xs">{labels[t.descKey]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export type ValidationLabels = {
  valRequired: string; valRequiredHint: string;
  valUnique: string; valUniqueHint: string;
  valRegex: string; valRegexHint: string; valRegexPlaceholder: string;
  valRegexMatch: string; valRegexFail: string; valRegexInvalid: string;
  valRange: string; valRangeAvailable: string; valRangeUnavailable: string;
  valRangeMin: string; valRangeMax: string; valRangeTo: string;
  valDropdown: string; valDropdownHint: string; valDropdownPlaceholder: string;
};

function RowToggle({
  label,
  hint,
  name,
  defaultOn,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = React.useState(Boolean(defaultOn));
  return (
    <div className="sg-row flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <div className="sg-label font-medium">{label}</div>
        {hint ? <div className="sg-hint muted text-xs">{hint}</div> : null}
      </div>
      <div className="sg-field">
        <input type="hidden" name={name} value={on ? 'on' : ''} />
        <Switch checked={on} onCheckedChange={setOn} aria-label={label} />
      </div>
    </div>
  );
}

export function ValidationRules({
  dataType,
  refTables,
  labels,
}: {
  dataType: string;
  refTables: string[];
  labels: ValidationLabels;
}) {
  const showRange = dataType === 'number' || dataType === 'date';

  const [regexOn, setRegexOn] = React.useState(false);
  const [regex, setRegex] = React.useState('');
  const [regexTest, setRegexTest] = React.useState('');
  const [rangeOn, setRangeOn] = React.useState(false);
  const [dropdownOn, setDropdownOn] = React.useState(false);
  const [dropdownSource, setDropdownSource] = React.useState('');

  let regexResult: 'match' | 'fail' | 'invalid' | null = null;
  if (regexOn && regex) {
    try {
      regexResult = new RegExp(regex).test(regexTest) ? 'match' : 'fail';
    } catch {
      regexResult = 'invalid';
    }
  }

  return (
    <div className="sg-section schema-column-wizard__validation">
      <div className="sg-section-body p-0">
        <RowToggle label={labels.valRequired} hint={labels.valRequiredHint} name="validationRequired" />
        <RowToggle label={labels.valUnique} hint={labels.valUniqueHint} name="validationUnique" />

        {/* Regex with live preview (parity: schema-wizard.jsx:248-268) */}
        <div className="sg-row block px-4 py-3" data-rule="regex">
          <div className="flex items-center justify-between">
            <div>
              <div className="sg-label font-medium">{labels.valRegex}</div>
              <div className="sg-hint muted text-xs">{labels.valRegexHint}</div>
            </div>
            <input type="hidden" name="regexOn" value={regexOn ? 'on' : ''} />
            <Switch checked={regexOn} onCheckedChange={setRegexOn} aria-label={labels.valRegex} />
          </div>
          {regexOn ? (
            <div className="mt-2.5 grid gap-2">
              <input
                className="form-input mono text-xs"
                name="regexPattern"
                aria-label={labels.valRegex}
                placeholder="^[A-Z]{3}-\d{4}$"
                value={regex}
                onChange={(e) => setRegex(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <input
                  className="form-input flex-1 text-xs"
                  aria-label={labels.valRegexPlaceholder}
                  placeholder={labels.valRegexPlaceholder}
                  value={regexTest}
                  onChange={(e) => setRegexTest(e.target.value)}
                />
                {regexResult === 'match' ? (
                  <Badge variant="success" aria-live="polite">● {labels.valRegexMatch}</Badge>
                ) : null}
                {regexResult === 'fail' ? (
                  <Badge variant="danger" aria-live="polite">✕ {labels.valRegexFail}</Badge>
                ) : null}
                {regexResult === 'invalid' ? (
                  <Badge variant="warning" aria-live="polite">⚠ {labels.valRegexInvalid}</Badge>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Range (number/date only) (parity: schema-wizard.jsx:270-286) */}
        <div className="sg-row block px-4 py-3" data-rule="range" data-available={showRange || undefined} style={{ opacity: showRange ? 1 : 0.5 }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="sg-label font-medium">{labels.valRange}</div>
              <div className="sg-hint muted text-xs">{showRange ? labels.valRangeAvailable : labels.valRangeUnavailable}</div>
            </div>
            <input type="hidden" name="rangeOn" value={rangeOn && showRange ? 'on' : ''} />
            <Switch
              checked={rangeOn && showRange}
              disabled={!showRange}
              onCheckedChange={(v) => showRange && setRangeOn(v)}
              aria-label={labels.valRange}
            />
          </div>
          {rangeOn && showRange ? (
            <div className="mt-2.5 flex items-center gap-2">
              <input name="rangeMin" placeholder={labels.valRangeMin} aria-label={labels.valRangeMin} className="form-input text-xs" style={{ width: 140 }} />
              <span className="muted text-xs">{labels.valRangeTo}</span>
              <input name="rangeMax" placeholder={labels.valRangeMax} aria-label={labels.valRangeMax} className="form-input text-xs" style={{ width: 140 }} />
            </div>
          ) : null}
        </div>

        {/* Dropdown source (parity: schema-wizard.jsx:288-305) */}
        <div className="sg-row block px-4 py-3" data-rule="dropdown">
          <div className="flex items-center justify-between">
            <div>
              <div className="sg-label font-medium">{labels.valDropdown}</div>
              <div className="sg-hint muted text-xs">{labels.valDropdownHint}</div>
            </div>
            <input type="hidden" name="dropdownOn" value={dropdownOn ? 'on' : ''} />
            <Switch checked={dropdownOn} onCheckedChange={setDropdownOn} aria-label={labels.valDropdown} />
          </div>
          {dropdownOn ? (
            <div className="mt-2.5">
              <input type="hidden" name="dropdownSource" value={dropdownSource} />
              <Select value={dropdownSource} onValueChange={setDropdownSource} aria-label={labels.valDropdown}>
                <SelectTrigger aria-label={labels.valDropdown}>
                  <SelectValue placeholder={labels.valDropdownPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {refTables.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
