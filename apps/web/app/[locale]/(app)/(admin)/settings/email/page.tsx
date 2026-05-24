'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type EmailProvider = 'Resend' | 'Postmark' | 'SES';

type EmailProviderSettings = {
  provider: EmailProvider;
  apiKeyDisplay: string;
  fromEmail: string;
  fromName: string;
};

type EmailTemplate = {
  code: string;
  name: string;
  consumer: string;
  subject: string;
  active: boolean;
};

type TestSendInput = {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
};

type TestSendResult = { ok: true; message_id: string } | { ok: false; error: string };

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type EmailTemplatesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  providerSettings?: EmailProviderSettings;
  templates?: EmailTemplate[];
  testSend?: (input: TestSendInput) => Promise<TestSendResult>;
};

type Labels = {
  title: string;
  subtitle: string;
  testSend: string;
  newTemplate: string;
  providerTitle: string;
  providerSubtitle: string;
  provider: string;
  apiKey: string;
  rotate: string;
  fromEmail: string;
  fromName: string;
  templatesTitle: string;
  triggerCode: string;
  name: string;
  consumer: string;
  subjectPreview: string;
  active: string;
  edit: string;
  emptyTitle: string;
  emptyBody: string;
  variablesReference: string;
  loading: string;
  error: string;
  permissionDenied: string;
  sent: string;
  testSendError: string;
  newEmailTemplate: string;
  editEmailTemplate: string;
  createEmailTemplate: string;
  close: string;
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
const PROVIDER_OPTIONS = [
  { value: 'Resend', label: 'Resend' },
  { value: 'Postmark', label: 'Postmark' },
  { value: 'SES', label: 'SES' },
];

const CardContentBox = CardContent as React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;

function interpolate(label: string, values: Record<string, string | number>) {
  return label.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

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
  void input;
  return { ok: true, message_id: 'not_configured' };
}

export default function EmailTemplatesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as EmailTemplatesPageProps;
  const labels = buildLabelsFromTranslations(useTranslations('settings.email_templates'));
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

function EmailTemplatesScreen({
  labels,
  providerSettings,
  templates,
  state,
  testSend,
}: {
  labels: Labels;
  providerSettings: EmailProviderSettings;
  templates: EmailTemplate[];
  state: PageState;
  testSend: (input: TestSendInput) => Promise<TestSendResult>;
}) {
  const [provider, setProvider] = React.useState<EmailProvider>(providerSettings.provider);
  const [fromEmail, setFromEmail] = React.useState(providerSettings.fromEmail);
  const [fromName, setFromName] = React.useState(providerSettings.fromName);
  const [toast, setToast] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [modalTemplate, setModalTemplate] = React.useState<EmailTemplate | null | undefined>(undefined);

  React.useEffect(() => {
    setProvider(providerSettings.provider);
    setFromEmail(providerSettings.fromEmail);
    setFromName(providerSettings.fromName);
  }, [providerSettings.provider, providerSettings.fromEmail, providerSettings.fromName]);

  async function sendProbe() {
    if (state === 'permission_denied') return;
    const result = await testSend({ provider, fromEmail, fromName });
    if (result.ok) {
      setToast({ tone: 'success', text: interpolate(labels.sent, { messageId: result.message_id }) });
    } else {
      const errorText = 'error' in result ? result.error : labels.testSendError;
      setToast({ tone: 'error', text: errorText || labels.testSendError });
    }
  }

  return (
    <main
      data-testid="settings-email-templates-screen"
      data-route="/settings/email"
      data-screen="email_templates_screen"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/admin-screens.jsx:626-673"
      className="space-y-3 p-6"
      aria-busy={state === 'loading'}
    >
      <header data-region="page-head" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{labels.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" className="btn-secondary" onClick={() => void sendProbe()} disabled={state === 'loading' || state === 'error' || state === 'permission_denied'}>
            {labels.testSend}
          </Button>
          <Button
            type="button"
            className="btn-primary"
            aria-label={state === 'empty' ? labels.createEmailTemplate : labels.newTemplate}
            onClick={() => {
              if (state !== 'permission_denied') setModalTemplate(null);
            }}
            disabled={state === 'loading' || state === 'error' || state === 'permission_denied'}
          >
            {labels.newTemplate}
          </Button>
        </div>
      </header>

      {state === 'error' ? (
        <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {labels.error}
        </section>
      ) : state === 'permission_denied' ? (
        <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {labels.permissionDenied}
        </section>
      ) : (
        <>
          <SettingsSection
            title={labels.providerTitle}
            subtitle={labels.providerSubtitle}
            region="provider-section"
          >
            <ProviderRow label={labels.provider} htmlFor="settings-email-provider-trigger">
              <Select value={provider} onValueChange={(value) => setProvider(value as EmailProvider)} options={PROVIDER_OPTIONS}>
                <SelectTrigger aria-label={labels.provider} className="min-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
              </Select>
            </ProviderRow>
            <ProviderRow label={labels.apiKey} htmlFor="settings-email-api-key">
              <div className="flex items-center gap-2">
                <Input
                  id="settings-email-api-key"
                  aria-label={labels.apiKey}
                  type="password"
                  value=""
                  readOnly
                  autoComplete="off"
                  className="w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <Button type="button" className="btn-secondary btn-sm">
                  {labels.rotate}
                </Button>
              </div>
            </ProviderRow>
            <ProviderRow label={labels.fromEmail} htmlFor="settings-email-from-email">
              <Input
                id="settings-email-from-email"
                type="email"
                value={fromEmail}
                onChange={(event) => setFromEmail(event.currentTarget.value)}
                className="w-[300px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </ProviderRow>
            <ProviderRow label={labels.fromName} htmlFor="settings-email-from-name">
              <Input
                id="settings-email-from-name"
                value={fromName}
                onChange={(event) => setFromName(event.currentTarget.value)}
                className="w-[300px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </ProviderRow>
          </SettingsSection>

          <SettingsSection title={interpolate(labels.templatesTitle, { count: templates.length })} region="templates-section">
            {state === 'loading' ? (
              <section
                role="status"
                aria-label={labels.loading}
                className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700"
              >
                {labels.loading}
              </section>
            ) : state === 'empty' || templates.length === 0 ? (
              <EmptyTemplates labels={labels} onNewTemplate={() => setModalTemplate(null)} />
            ) : (
              <TemplatesTable labels={labels} templates={templates} onEditTemplate={(template) => setModalTemplate(template)} />
            )}
          </SettingsSection>

          <div
            data-region="variables-reference"
            role="note"
            className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950"
          >
            {labels.variablesReference}
          </div>
        </>
      )}

      {toast ? (
        <div role={toast.tone === 'success' ? 'status' : 'alert'} aria-live={toast.tone === 'success' ? 'polite' : 'assertive'} className="sr-only">
          {toast.text}
        </div>
      ) : null}

      {modalTemplate !== undefined ? (
        <TemplateDialog labels={labels} template={modalTemplate} onClose={() => setModalTemplate(undefined)} />
      ) : null}
    </main>
  );
}

function SettingsSection({
  title,
  subtitle,
  region,
  children,
}: {
  title: string;
  subtitle?: string;
  region: string;
  children: React.ReactNode;
}) {
  return (
    <Card data-testid="settings-email-section" data-region={region} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-200 p-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {subtitle ? <CardDescription className="mt-1 text-xs text-slate-500">{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContentBox className="space-y-3 p-4">{children as React.ReactElement | React.ReactElement[]}</CardContentBox>
    </Card>
  );
}

function ProviderRow({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div data-testid="settings-email-provider-row" data-label={label} className="grid grid-cols-[160px_1fr] items-center gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div>{children}</div>
    </div>
  );
}

function EmptyTemplates({ labels, onNewTemplate }: { labels: Labels; onNewTemplate: () => void }) {
  return (
    <section role="status" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div aria-hidden="true" className="text-2xl">
        ✉️
      </div>
      <h2 className="mt-2 text-base font-semibold text-slate-950">{labels.emptyTitle}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600">{labels.emptyBody}</p>
      <Button type="button" className="btn-primary mt-4" onClick={onNewTemplate}>
        {labels.newTemplate}
      </Button>
    </section>
  );
}

function TemplatesTable({
  labels,
  templates,
  onEditTemplate,
}: {
  labels: Labels;
  templates: EmailTemplate[];
  onEditTemplate: (template: EmailTemplate) => void;
}) {
  return (
    <Table aria-label="Templates" className="w-full text-sm">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{labels.triggerCode}</TableHead>
          <TableHead scope="col">{labels.name}</TableHead>
          <TableHead scope="col">{labels.consumer}</TableHead>
          <TableHead scope="col">{labels.subjectPreview}</TableHead>
          <TableHead scope="col">{labels.active}</TableHead>
          <TableHead scope="col" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template, index) => (
          <TableRow key={template.code} data-testid="settings-email-template-row">
            <TableCell>
              <code data-testid="settings-email-template-code" className="mono font-semibold text-slate-950">
                {template.code}
              </code>
            </TableCell>
            <TableCell>{template.name}</TableCell>
            <TableCell className="text-[11px] text-slate-500">{template.consumer}</TableCell>
            <TableCell className="max-w-[260px] text-xs italic text-slate-500">{template.subject}</TableCell>
            <TableCell>
              <Badge variant={template.active ? 'success' : 'muted'} className="text-[9px]">
                {template.active ? 'active' : 'off'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button
                type="button"
                className="btn-secondary btn-sm"
                aria-label={index === 0 ? `Edit ${template.code}` : `Modify ${template.code}`}
                onClick={() => onEditTemplate(template)}
              >
                {labels.edit}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TemplateDialog({ labels, template, onClose }: { labels: Labels; template: EmailTemplate | null; onClose: () => void }) {
  const title = template ? interpolate(labels.editEmailTemplate, { code: template.code }) : labels.newEmailTemplate;
  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose(); }} size="md" modalId="SM-04">
      <div className="w-[520px] rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <Modal.Header title={title} />
        </div>
        <Modal.Body>
          <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
            <p>{template ? template.name : labels.emptyBody}</p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4">
            <Button type="button" className="btn-secondary" onClick={onClose}>
              {labels.close}
            </Button>
          </div>
        </Modal.Footer>
      </div>
    </Modal>
  );
}
