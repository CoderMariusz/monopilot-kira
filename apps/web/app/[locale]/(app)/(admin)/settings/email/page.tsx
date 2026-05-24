import { getTranslations } from 'next-intl/server';

import EmailTemplatesScreen, {
  type EmailProviderSettings,
  type EmailTemplate,
  type Labels,
  type PageState,
  type TestSendInput,
  type TestSendResult,
} from './email-templates-screen.client';

type EmailTemplatesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  providerSettings?: EmailProviderSettings;
  templates?: EmailTemplate[];
  testSend?: (input: TestSendInput) => Promise<TestSendResult>;
};

const DEFAULT_LABELS: Labels = {
  title: 'Email templates',
  subtitle: 'Trigger-driven transactional templates consumed by Planning, Shipping, QA.',
  testSend: 'Test send…',
  newTemplate: '+ New template',
  providerTitle: 'Provider',
  providerSubtitle: 'SMTP / API provider used to send all Monopilot transactional mail.',
  provider: 'Provider',
  apiKey: 'API key',
  rotate: 'Rotate',
  fromEmail: 'From email',
  fromName: 'From name',
  templatesTitle: 'Templates ({count})',
  triggerCode: 'Trigger code',
  name: 'Name',
  consumer: 'Consumer',
  subjectPreview: 'Subject preview',
  active: 'Active',
  edit: 'Edit →',
  emptyTitle: 'No email templates yet',
  emptyBody:
    'Create a template to customize the emails Monopilot sends for POs, approvals, overdue reminders, and more.',
  variablesReference:
    'Variables reference: open Email variables in the left nav for the full merge-field picker used inside each template body.',
  loading: 'Loading email templates…',
  error: 'Unable to load email template settings.',
  permissionDenied: 'You do not have permission to manage email templates.',
  sent: 'Probe sent — message_id {messageId}',
  testSendError: 'Unable to send probe email.',
  newEmailTemplate: 'New email template',
  editEmailTemplate: 'Edit template {code}',
  createEmailTemplate: 'Create email template',
  close: 'Close',
};

// Explicit fallback provenance: project-shaped Settings email template rows, used until SET-090 Drizzle loaders are wired.
const DEFAULT_PROVIDER_SETTINGS: EmailProviderSettings = {
  provider: 'Resend',
  apiKeyDisplay: '',
  fromEmail: 'no-reply@monopilot.apex.pl',
  fromName: 'Apex Foods · Monopilot',
};

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    code: 'po_to_supplier',
    name: 'Purchase order → supplier',
    consumer: 'Planning',
    subject: 'PO {{po_number}} for {{supplier_email}}',
    active: true,
  },
  {
    code: 'qa_hold_created',
    name: 'Quality hold created',
    consumer: 'QA',
    subject: 'Hold {{hold_code}} requires QA review',
    active: false,
  },
];

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

function buildLabelsFromTranslations(t: (key: string) => string): Labels {
  return LABEL_KEYS.reduce((labels, key) => {
    try {
      const translated = t(key);
      labels[key] = translated && translated !== key ? translated : DEFAULT_LABELS[key];
    } catch {
      labels[key] = DEFAULT_LABELS[key];
    }
    return labels;
  }, {} as Labels);
}

async function defaultTestSend(input: TestSendInput): Promise<TestSendResult> {
  'use server';

  void input;
  return { ok: true, message_id: 'not_configured' };
}

export default async function EmailTemplatesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as EmailTemplatesPageProps;
  const labels = buildLabelsFromTranslations(await getTranslations('settings.email_templates'));
  const providerSettings = props.providerSettings ?? DEFAULT_PROVIDER_SETTINGS;
  const templates = props.templates ?? DEFAULT_TEMPLATES;
  const state: PageState = props.state ?? (templates.length === 0 ? 'empty' : 'ready');

  return (
    <EmailTemplatesScreen
      labels={labels}
      providerSettings={providerSettings}
      templates={templates}
      state={state}
      testSend={props.testSend ?? defaultTestSend}
    />
  );
}
