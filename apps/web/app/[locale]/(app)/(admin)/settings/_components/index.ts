/**
 * Shared settings design-system primitives (A2).
 *
 * These mirror the prototype primitives in
 * `prototypes/design/Monopilot Design System/settings/shell.jsx:61-105` and
 * emit the `.sg-*` class names styled by the ported settings design-system CSS
 * (A1). Compose screens out of these instead of hand-rolling Tailwind layouts.
 *
 * See `./README.md` for the composition contract.
 */
export { PageHead } from './PageHead';
export type { PageHeadProps } from './PageHead';

export { Section } from './Section';
export type { SectionProps } from './Section';

export { SRow } from './SRow';
export type { SRowProps } from './SRow';

export { Toggle } from './Toggle';
export type { ToggleProps } from './Toggle';

export { SettingField } from './SettingField';
export type { SettingFieldProps } from './SettingField';

export { SelectField } from './SelectField';
export type { SelectFieldProps, SelectFieldOption } from './SelectField';
