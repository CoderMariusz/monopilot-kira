import { getTranslations } from 'next-intl/server';
import EmailTemplatesScreen, {
  type EmailTemplateVariableGroup,
  type EmailProviderSettings,
  type EmailTemplate,
  type EmailTriggerOption,
  type Labels,
  type PageState,
  type SaveTemplate,
  type TestSendInput,
  type TestSendResult,
} from './email-templates-screen.client';
import { loadEmailTemplatesData } from '../../../../../../actions/email/load-email-config';
import {
  saveEmailTemplate,
  testEmailTemplateSend,
} from './_actions/email-template-actions';

type EmailTemplatesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  providerSettings?: EmailProviderSettings;
  templates?: EmailTemplate[];
  variableGroups?: EmailTemplateVariableGroup[];
  supportedTriggers?: EmailTriggerOption[];
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

// Production renders real Supabase data via loadEmailTemplatesData() (withOrgContext /
// RLS). These constants are only the fallback shape used when a test injects no rows.
const DEFAULT_PROVIDER_SETTINGS: EmailProviderSettings = {
  provider: 'Resend',
  apiKeyDisplay: '',
  fromEmail: '',
  fromName: '',
};

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

  // Injected-data mode: a test (or storybook) supplies provider/templates/state
  // directly. Production mode: no data props → read real org-scoped Supabase rows.
  const hasInjectedData =
    Array.isArray(props.templates) || props.providerSettings !== undefined || props.state !== undefined;

  let providerSettings: EmailProviderSettings;
  let templates: EmailTemplate[];
  let variableGroups: EmailTemplateVariableGroup[];
  let supportedTriggers: EmailTriggerOption[];
  let loadedState: PageState;
  let canEdit: boolean;

  if (hasInjectedData) {
    providerSettings = props.providerSettings ?? DEFAULT_PROVIDER_SETTINGS;
    templates = props.templates ?? [];
    variableGroups = props.variableGroups ?? [];
    supportedTriggers = props.supportedTriggers ?? [];
    loadedState = props.state ?? (templates.length === 0 ? 'empty' : 'ready');
    // Injected mode cannot prove RBAC; edit/test-send availability is driven solely
    // by the explicitly injected action props below.
    canEdit = false;
  } else {
    const loaded = await loadEmailTemplatesData();
    providerSettings = loaded.providerSettings;
    templates = loaded.templates;
    variableGroups = loaded.variableGroups;
    supportedTriggers = loaded.supportedTriggers;
    loadedState = loaded.state;
    canEdit = loaded.canEdit;
  }

  // Test-send: available to authorized callers (real settings.email.edit permission),
  // never denied-by-default. Tests inject their own reviewed testSend.
  const reviewedTestSend: ((input: TestSendInput) => Promise<TestSendResult>) | undefined = hasInjectedData
    ? props.testSend
    : canEdit
      ? testEmailTemplateSend
      : undefined;
  const hasReviewedTestSend = typeof reviewedTestSend === 'function';

  const reviewedSaveTemplate: SaveTemplate | undefined = hasInjectedData
    ? props.saveTemplate
    : canEdit
      ? saveEmailTemplate
      : undefined;

  // Permission-denied is an explicit loader state; otherwise honor the loaded state.
  const state: PageState = loadedState;
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
      supportedTriggers={supportedTriggers}
      variablesHref={`/${locale}/settings/email/variables`}
      state={state}
      saveTemplate={reviewedSaveTemplate}
      testSend={reviewedTestSend}
    />
  );
}
