import React from 'react';
import { getTranslations } from 'next-intl/server';

import EmailVariablesScreen, {
  type EmailTemplateVariableGroup,
  type EmailVariablesScreenLabels,
  type PageState,
} from './email-variables-screen.client';
import { loadEmailVariablesData } from '../../../../../../../actions/email/load-email-config';

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

  // Injected-data mode: a test supplies groups/state directly. Production mode:
  // no data props → run the real org-scoped (withOrgContext / RLS) loader, which
  // returns the merge-field domain registry after the RBAC gate passes.
  const hasInjectedGroups = Array.isArray(props.groups);
  let groups: EmailTemplateVariableGroup[];
  let state: PageState;

  if (hasInjectedGroups || props.state !== undefined) {
    groups = props.groups ?? [];
    state = props.state ?? (groups.length === 0 ? 'empty' : 'ready');
  } else {
    const loaded = await loadEmailVariablesData();
    groups = loaded.groups;
    state = loaded.state;
  }

  return React.createElement(EmailVariablesScreen, { labels, groups, state });
}
