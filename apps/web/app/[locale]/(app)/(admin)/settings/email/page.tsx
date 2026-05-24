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

// No production fallback provider/template rows: until SET-090 live loader data is injected,
// render an explicit empty/provenance state instead of tenant-flavored sample settings.
const DEFAULT_PROVIDER_SETTINGS: EmailProviderSettings = {
  provider: 'Resend',
  apiKeyDisplay: '',
  fromEmail: '',
  fromName: '',
};

const DEFAULT_TEMPLATES: EmailTemplate[] = [];

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
  return { ok: false, error: DEFAULT_LABELS.testSendError };
}

export default async function EmailTemplatesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as EmailTemplatesPageProps;
  const labels = buildLabelsFromTranslations(await getTranslations('settings.email_templates'));
  const providerSettings = props.providerSettings ?? DEFAULT_PROVIDER_SETTINGS;
  const templates = props.templates ?? DEFAULT_TEMPLATES;
  const hasReviewedTestSend = typeof props.testSend === 'function';
  const reviewedTestSend = props.testSend;
  const failClosedTestSend = hasReviewedTestSend && reviewedTestSend
    ? async (input: TestSendInput): Promise<TestSendResult> => {
        const result = await reviewedTestSend(input);
        if (result.ok && result.message_id === 'not_configured') {
          return { ok: false, error: labels.testSendError };
        }
        return result;
      }
    : undefined;
  const state: PageState = hasReviewedTestSend ? (props.state ?? (templates.length === 0 ? 'empty' : 'ready')) : 'permission_denied';
  const screenLabels = hasReviewedTestSend
    ? labels
    : {
        ...labels,
        permissionDenied: 'Email test send unavailable: provider backend is not configured yet.',
        subtitle: `${labels.subtitle} Email test send unavailable: provider backend is not configured yet.`,
      };

  return (
    <EmailTemplatesScreen
      labels={screenLabels}
      providerSettings={providerSettings}
      templates={templates}
      state={state}
      testSend={failClosedTestSend ?? defaultTestSend}
    />
  );
}
