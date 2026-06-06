# Settings design-system primitives

Shared React primitives for the Settings area (plan A2). They mirror the
canonical prototype primitives in
`prototypes/design/Monopilot Design System/settings/shell.jsx:61-105` and emit
the prototype `.sg-*` class names. The matching styling lives in the ported
settings design-system CSS (plan A1) — these components only produce the
structure + classes, so a screen built from them is correct by construction and
stays in parity with the prototype.

**Do not** re-introduce Tailwind layout (label-above-input stacks, ad-hoc
`text-lg` titles, custom borders) for settings forms. Compose these primitives.

## The primitives

| Primitive | Renders | Use for |
|---|---|---|
| `PageHead` | `.sg-head` (`.sg-title` / `.sg-sub`) + actions | screen header |
| `Section` | `.sg-section` > `.sg-section-head` > `.sg-section-body` > `.sg-section-foot` | a card-like group of rows |
| `SRow` | `.sg-row` (`.sg-label` + `.sg-hint`) + `.sg-field` | one two-column setting row |
| `Toggle` | `label.sg-toggle > input + span.slider` | boolean slider switch |
| `SettingField` | `SRow` + native `<input>` | a labelled text input row |
| `SelectField` | `SRow` + `@monopilot/ui/Select` | a labelled dropdown row |

Server-safe (no `'use client'`): `PageHead`, `Section`, `SRow`.
Client (`'use client'`): `Toggle`, `SettingField`, `SelectField`.

## Class names (must match the prototype exactly)

`sg-head`, `sg-title`, `sg-sub`, `sg-section`, `sg-section-head`,
`sg-section-title`, `sg-section-sub`, `sg-section-body`, `sg-section-foot`,
`sg-row`, `sg-label`, `sg-hint`, `sg-field`, `sg-toggle`, `slider`.

## How a screen composes them

A screen is: one `PageHead`, then one or more `Section`s. Each `Section` holds
`SRow`/`SettingField`/`SelectField` rows in its body, and (optionally) the
Save/Cancel actions in its grey `foot`.

```tsx
'use client';

import {
  PageHead,
  Section,
  SettingField,
  SelectField,
  SRow,
  Toggle,
} from '../_components';
import { Button } from '@monopilot/ui/Button';

export function ExampleScreen() {
  const [draft, setDraft] = useState(initial);

  return (
    <main>
      <PageHead
        title="Company profile"
        sub="Legal identity, address, and locale defaults."
      />

      <Section
        title="Identity"
        sub="How the organisation appears across the product."
        foot={
          <>
            <Button className="btn-ghost">Cancel</Button>
            <Button className="btn-primary">Save changes</Button>
          </>
        }
      >
        <SettingField
          id="trading-name"
          label="Trading name"
          hint="Shown in headers and reports."
          value={draft.tradingName}
          onChange={(v) => setDraft((d) => ({ ...d, tradingName: v }))}
        />

        <SelectField
          id="currency"
          label="Default currency"
          options={[
            { value: 'EUR', label: 'EUR' },
            { value: 'PLN', label: 'PLN' },
          ]}
          value={draft.currency}
          onChange={(v) => setDraft((d) => ({ ...d, currency: v }))}
        />

        {/* Custom field content still gets the row layout via SRow */}
        <SRow label="Email notifications" hint="Send a daily digest.">
          <Toggle
            aria-label="Email notifications"
            checked={draft.emailDigest}
            onChange={(v) => setDraft((d) => ({ ...d, emailDigest: v }))}
          />
        </SRow>
      </Section>
    </main>
  );
}
```

### Conventions

- **Footer actions** go in `Section.foot` (the grey `.sg-section-foot`), not as
  a single page-level button.
- **Label association**: `SettingField` / `SelectField` wire the label to the
  control via `id` automatically. For a hand-built `SRow`, pass `htmlFor` and
  give the control a matching `id`.
- **Hints** belong on the row (`hint` prop), rendered as `.sg-hint` under the
  label.
- **Dropdowns** use `SelectField` (the shared `@monopilot/ui/Select`), never a
  raw `<select>` — keeps every settings dropdown on the one hardened component.
- **Toggles** use `Toggle` (the `.sg-toggle` slider), not `@monopilot/ui/Switch`.
