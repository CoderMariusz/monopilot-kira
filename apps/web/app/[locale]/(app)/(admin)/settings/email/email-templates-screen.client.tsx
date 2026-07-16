'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import EmailTemplateEditModal, {
  type EmailTemplateDraft,
  type EmailTemplateSaveResult,
  type EmailTemplateVariableGroup,
  type EmailTriggerOption,
} from '../../../../../../components/settings/modals/email-template-edit-modal';

export type { EmailTemplateDraft, EmailTemplateSaveResult, EmailTemplateVariableGroup, EmailTriggerOption };

export type EmailProvider = 'Resend' | 'Postmark' | 'SES';

export type EmailProviderSettings = {
  provider: EmailProvider;
  apiKeyDisplay: string;
  fromEmail: string;
  fromName: string;
};

export type EmailTemplate = {
  code: string;
  name: string;
  consumer: string;
  subject: string;
  body?: string;
  active: boolean;
  activeTo?: string[];
};

export type TestSendInput = {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
};

export type TestSendResult = { ok: true; message_id: string } | { ok: false; error: string };

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type Labels = {
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
  variablesLinkLabel?: string;
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

export type SaveTemplate = (input: EmailTemplateDraft) => Promise<EmailTemplateSaveResult>;

const PROVIDER_OPTIONS = [
  { value: 'Resend', label: 'Resend' },
  { value: 'Postmark', label: 'Postmark' },
  { value: 'SES', label: 'SES' },
];

const CardContentBox = CardContent as React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;

function interpolate(label: string, values: Record<string, string | number>) {
  return label.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export default function EmailTemplatesScreen({
  labels,
  providerSettings,
  templates,
  variableGroups = [],
  supportedTriggers = [],
  variablesHref = '/en/settings/email/variables',
  state,
  saveTemplate,
  testSend,
}: {
  labels: Labels;
  providerSettings: EmailProviderSettings;
  templates: EmailTemplate[];
  variableGroups?: EmailTemplateVariableGroup[];
  supportedTriggers?: EmailTriggerOption[];
  variablesHref?: string;
  state: PageState;
  saveTemplate?: SaveTemplate;
  testSend?: (input: TestSendInput) => Promise<TestSendResult>;
}) {
  const router = useRouter();
  const [provider, setProvider] = React.useState<EmailProvider>(providerSettings.provider);
  const [fromEmail, setFromEmail] = React.useState(providerSettings.fromEmail);
  const [fromName, setFromName] = React.useState(providerSettings.fromName);
  const [toast, setToast] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [visibleTemplates, setVisibleTemplates] = React.useState(templates);
  const [modalTemplate, setModalTemplate] = React.useState<EmailTemplate | null | undefined>(undefined);

  React.useEffect(() => {
    setProvider(providerSettings.provider);
    setFromEmail(providerSettings.fromEmail);
    setFromName(providerSettings.fromName);
  }, [providerSettings.provider, providerSettings.fromEmail, providerSettings.fromName]);

  React.useEffect(() => {
    setVisibleTemplates(templates);
  }, [templates]);

  const hasReviewedTestSend = typeof testSend === 'function';
  const canEditTemplates = typeof saveTemplate === 'function' && state !== 'permission_denied';
  const testSendUnavailableText = `${labels.testSend} unavailable: ${labels.testSendError}`;

  async function sendProbe() {
    if (state === 'permission_denied' || typeof testSend !== 'function') return;
    const result = await testSend({ provider, fromEmail, fromName });
    if (result.ok && result.message_id === 'not_configured') {
      setToast({ tone: 'error', text: labels.testSendError });
    } else if (result.ok) {
      setToast({ tone: 'success', text: interpolate(labels.sent, { messageId: result.message_id }) });
    } else {
      const errorText = 'error' in result ? result.error : labels.testSendError;
      setToast({ tone: 'error', text: errorText || labels.testSendError });
    }
  }

  const eventPayloadSchema = React.useMemo(
    () => ({
      variables: variableGroups.flatMap((group) => group.vars.map((variable) => variable.name)),
    }),
    [variableGroups],
  );

  async function handleSaveTemplate(input: EmailTemplateDraft): Promise<EmailTemplateSaveResult> {
    if (!saveTemplate) return { ok: false, error: 'SAVE_TEMPLATE_UNAVAILABLE' };

    const result = await saveTemplate(input);
    if (!result.ok) return result;

    setVisibleTemplates((current) => {
      const existing = current.find((template) => template.code === input.code) ?? modalTemplate ?? null;
      const nextTemplate: EmailTemplate = {
        code: input.code,
        name: input.name,
        consumer: existing?.consumer ?? 'Settings',
        subject: input.subject,
        body: input.body,
        active: input.active,
        activeTo: input.activeTo,
      };
      const found = current.some((template) => template.code === input.code);
      return found
        ? current.map((template) => (template.code === input.code ? { ...template, ...nextTemplate } : template))
        : [...current, nextTemplate];
    });
    router.refresh?.();
    return result;
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
      <header data-region="page-head" className="sg-head flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="helper mt-1">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="btn-secondary"
            onClick={() => void sendProbe()}
            disabled={state === 'loading' || state === 'error' || state === 'permission_denied' || !hasReviewedTestSend}
          >
            {labels.testSend}
          </Button>
          <Button
            type="button"
            className="btn-primary"
            aria-label={state === 'empty' ? labels.createEmailTemplate : labels.newTemplate}
            onClick={() => {
              if (canEditTemplates) setModalTemplate(null);
            }}
            disabled={state === 'loading' || state === 'error' || !canEditTemplates}
          >
            {labels.newTemplate}
          </Button>
        </div>
      </header>

      {state === 'error' ? (
        <section role="alert" className="alert alert-red">
          {labels.error}
        </section>
      ) : state === 'permission_denied' ? (
        <section role="alert" className="alert alert-amber">
          {labels.permissionDenied}
        </section>
      ) : (
        <>
          {!hasReviewedTestSend ? (
            <section role="alert" className="alert alert-amber">
              {testSendUnavailableText}
            </section>
          ) : null}
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
                  className="form-input w-[200px]"
                />
                <Button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled
                  title="Key rotation is not available yet."
                >
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
                className="form-input w-[300px]"
              />
            </ProviderRow>
            <ProviderRow label={labels.fromName} htmlFor="settings-email-from-name">
              <Input
                id="settings-email-from-name"
                value={fromName}
                onChange={(event) => setFromName(event.currentTarget.value)}
                className="form-input w-[300px]"
              />
            </ProviderRow>
          </SettingsSection>

          <SettingsSection title={interpolate(labels.templatesTitle, { count: visibleTemplates.length })} region="templates-section">
            {state === 'loading' ? (
              <section
                role="status"
                aria-label={labels.loading}
                className="card helper"
              >
                {labels.loading}
              </section>
            ) : visibleTemplates.length === 0 ? (
              <EmptyTemplates labels={labels} canCreate={canEditTemplates} onNewTemplate={() => setModalTemplate(null)} />
            ) : (
              <TemplatesTable
                labels={labels}
                templates={visibleTemplates}
                canEdit={canEditTemplates}
                onEditTemplate={(template) => setModalTemplate(template)}
              />
            )}
          </SettingsSection>

          <div
            data-region="variables-reference"
            role="note"
            className="alert alert-blue"
          >
            <VariablesReference labels={labels} href={variablesHref} />
          </div>
        </>
      )}

      {toast ? (
        <div role={toast.tone === 'success' ? 'status' : 'alert'} aria-live={toast.tone === 'success' ? 'polite' : 'assertive'} className="sr-only">
          {toast.text}
        </div>
      ) : null}

      {modalTemplate !== undefined ? (
        <EmailTemplateEditModal
          open
          onOpenChange={(open) => {
            if (!open) setModalTemplate(undefined);
          }}
          template={draftFromTemplate(modalTemplate)}
          eventPayloadSchema={eventPayloadSchema}
          supportedTriggers={supportedTriggers}
          variableGroups={variableGroups}
          saveTemplate={handleSaveTemplate}
        />
      ) : null}
    </main>
  );
}

function draftFromTemplate(template: EmailTemplate | null): EmailTemplateDraft | undefined {
  if (!template) return undefined;
  return {
    code: template.code,
    name: template.name,
    subject: template.subject,
    body: template.body ?? template.subject,
    active: template.active,
    activeTo: template.activeTo ?? [],
  };
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
    <Card data-testid="settings-email-section" data-region={region} className="card">
      <CardHeader className="card-head mb-3 block border-b border-[var(--border)] pb-3">
        <h2 className="card-title">{title}</h2>
        {subtitle ? <CardDescription className="helper mt-1">{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContentBox className="space-y-3">{children as React.ReactElement | React.ReactElement[]}</CardContentBox>
    </Card>
  );
}

function ProviderRow({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div data-testid="settings-email-provider-row" data-label={label} className="grid grid-cols-[160px_1fr] items-center gap-3">
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      <div>{children}</div>
    </div>
  );
}

function EmptyTemplates({ labels, canCreate, onNewTemplate }: { labels: Labels; canCreate: boolean; onNewTemplate: () => void }) {
  return (
    <section role="status" className="empty-state">
      <div aria-hidden="true" className="empty-state-icon">
        ✉️
      </div>
      <h2 className="empty-state-title">{labels.emptyTitle}</h2>
      <p className="empty-state-body">{labels.emptyBody}</p>
      <div className="empty-state-action">
        <Button type="button" className="btn-primary" onClick={onNewTemplate} disabled={!canCreate}>
          {labels.newTemplate}
        </Button>
      </div>
    </section>
  );
}

function TemplatesTable({
  labels,
  templates,
  canEdit,
  onEditTemplate,
}: {
  labels: Labels;
  templates: EmailTemplate[];
  canEdit: boolean;
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
                disabled={!canEdit}
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

function VariablesReference({ labels, href }: { labels: Labels; href: string }) {
  const linkLabel = labels.variablesLinkLabel ?? 'Email variables';
  const [before, after] = labels.variablesReference.includes(linkLabel)
    ? labels.variablesReference.split(linkLabel, 2)
    : ['Variables reference: open ', ' in the left nav for the full merge-field picker used inside each template body.'];

  return (
    <>
      {before}
      <a href={href} className="font-semibold underline underline-offset-2">
        {linkLabel}
      </a>
      {after}
    </>
  );
}
