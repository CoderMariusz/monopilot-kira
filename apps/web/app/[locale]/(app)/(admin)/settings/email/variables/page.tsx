import React from 'react';
import { getTranslations } from 'next-intl/server';

import EmailVariablesScreen, {
  type EmailTemplateVariableGroup,
  type EmailVariablesScreenLabels,
  type PageState,
} from './email-variables-screen.client';

export const dynamic = 'force-dynamic';

type EmailVariablesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  groups?: EmailTemplateVariableGroup[];
};

type Labels = EmailVariablesScreenLabels;

const DEFAULT_LABELS: Labels = {
  title: 'Email template variables',
  subtitle: 'Merge fields available inside email templates (Mustache syntax).',
  guidance:
    'Click any variable to copy to clipboard. Variables are resolved per-trigger: PO variables only populate when the trigger payload is a PO.',
  searchPlaceholder: 'Search variable…',
  variable: 'Variable',
  description: 'Description',
  exampleValue: 'Example value',
  copy: 'Copy',
  copied: 'Copied {name} to clipboard',
  variablesCount: '{count} variables',
  loading: 'Loading email variables…',
  empty: 'No email variables are available yet.',
  error: 'Unable to load email variables.',
  permissionDenied: 'You do not have permission to view email variables.',
};

// Explicit fallback provenance: these groups are production-shaped placeholder values used only when a caller/test does not
// provide live DB/API email-variable rows; prototype mock data remains illustrative and is not treated as production truth.
const DEFAULT_GROUPS: EmailTemplateVariableGroup[] = [
  {
    group: 'Purchase order',
    vars: [
      { name: '{{order.number}}', desc: 'Purchase order number', example: 'PO-2026-00042' },
      { name: '{{order.total}}', desc: 'Gross order value', example: '€4,218.00' },
      { name: '{{supplier.name}}', desc: 'Purchase order supplier name', example: 'Apex Dairy Co.' },
    ],
  },
  {
    group: 'Quality',
    vars: [
      { name: '{{qa.release_status}}', desc: 'QA release status for the lot', example: 'Released' },
      { name: '{{lot.expiry_date}}', desc: 'Best-before date', example: '2026-09-30' },
    ],
  },
  {
    group: 'Shipping',
    vars: [{ name: '{{shipment.sscc}}', desc: 'SSCC-18 label number', example: '059012345678901234' }],
  },
];

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.email_variables' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

export default async function EmailVariablesPage(propsInput: unknown = {}) {
  const props = propsInput as EmailVariablesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const groups = props.groups ?? DEFAULT_GROUPS;
  const state: PageState = props.state ?? (groups.length === 0 ? 'empty' : 'ready');

  return React.createElement(EmailVariablesScreen, { labels, groups, state });
}
