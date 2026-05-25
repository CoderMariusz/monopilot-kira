import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

import EmailTemplatesScreen, {
  type EmailTemplateDraft,
  type EmailTemplateSaveResult,
  type EmailTemplateVariableGroup,
  type EmailProviderSettings,
  type EmailTemplate,
  type Labels,
  type PageState,
  type SaveTemplate,
  type TestSendInput,
  type TestSendResult,
} from './email-templates-screen.client';
import { upsertEmailConfig } from '../../../../../../actions/email/upsert-config';

type EmailTemplatesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  providerSettings?: EmailProviderSettings;
  templates?: EmailTemplate[];
  variableGroups?: EmailTemplateVariableGroup[];
  saveTemplate?: SaveTemplate;
  testSend?: (input: TestSendInput) => Promise<TestSendResult>;
};

const DEFAULT_LABELS: Required<Labels> = {
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
  variablesLinkLabel: 'Email variables',
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
const DEFAULT_VARIABLE_GROUPS: EmailTemplateVariableGroup[] = [];

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>;

function buildLabelsFromTranslations(t: (key: string) => string): Labels {
  const labels: Labels = { ...DEFAULT_LABELS };
  for (const key of LABEL_KEYS) {
    try {
      const translated = t(key);
      labels[key] = translated && translated !== key ? translated : DEFAULT_LABELS[key];
    } catch {
      labels[key] = DEFAULT_LABELS[key];
    }
  }
  return labels;
}

export default async function EmailTemplatesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as EmailTemplatesPageProps;
  const params = props.params ? await props.params : { locale: 'en' };
  const locale = params?.locale || 'en';
  const labels = buildLabelsFromTranslations(await getTranslations('settings.email_templates'));
  const providerSettings = props.providerSettings ?? DEFAULT_PROVIDER_SETTINGS;
  const templates = props.templates ?? DEFAULT_TEMPLATES;
  const variableGroups = props.variableGroups ?? DEFAULT_VARIABLE_GROUPS;
  const hasReviewedTestSend = typeof props.testSend === 'function';
  const reviewedTestSend = props.testSend;
  const reviewedSaveTemplate = props.saveTemplate ?? saveTemplateThroughEmailConfig;
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
      variableGroups={variableGroups}
      variablesHref={`/${locale}/settings/email/variables`}
      state={state}
      saveTemplate={reviewedSaveTemplate}
      testSend={failClosedTestSend}
    />
  );
}

async function saveTemplateThroughEmailConfig(input: EmailTemplateDraft): Promise<EmailTemplateSaveResult> {
  'use server';

  const result = await upsertEmailConfig({
    triggerCode: input.code,
    recipientsTo: input.activeTo.join('; '),
    subjectTemplate: input.subject,
    bodyTemplate: input.body,
    isActive: input.active,
  });

  if (result.status === 'ok') {
    revalidatePath('/settings/email');
    return { ok: true, templateCode: result.data.triggerCode, revalidatedPath: '/settings/email' };
  }

  return { ok: false, error: result.code };
}
