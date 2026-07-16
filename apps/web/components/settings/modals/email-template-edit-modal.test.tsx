/**
 * T-050 / SM-04 — EmailTemplateEditModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:141-259
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type TemplateVariable = {
  name: string;
  token: `{{${string}}}`;
  desc: string;
  triggers?: readonly string[];
};

type EmailTemplateVariableGroup = {
  group: string;
  vars: TemplateVariable[];
};

type EmailTemplateDraft = {
  code: string;
  name: string;
  subject: string;
  body: string;
  active: boolean;
  activeTo: string[];
};

type EmailTemplateSaveResult =
  | { ok: true; templateCode: string; revalidatedPath: '/settings/email-templates' }
  | { ok: false; error: 'UNKNOWN_TEMPLATE_VAR' | 'TEMPLATE_CODE_INVALID' | string };

type EmailTriggerOption = {
  code: string;
  label: string;
  description: string;
};

type EmailTemplateEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplateDraft;
  eventPayloadSchema: { variables: string[] };
  supportedTriggers: EmailTriggerOption[];
  variableGroups: EmailTemplateVariableGroup[];
  saveTemplate: (input: EmailTemplateDraft) => Promise<EmailTemplateSaveResult>;
};

const supportedTriggers: EmailTriggerOption[] = [
  {
    code: 'core_closed',
    label: 'FA core closed',
    description: 'Fired when a factory acceptance core stage is closed.',
  },
  {
    code: 'fa_d365_ready',
    label: 'FA D365 ready',
    description: 'Fired when a factory acceptance record is ready for Dynamics 365.',
  },
];

const variableGroups: EmailTemplateVariableGroup[] = [
  {
    group: 'Factory acceptance',
    vars: [
      {
        name: 'fa_code',
        token: '{{fa_code}}',
        desc: 'Factory acceptance code',
        triggers: ['core_closed', 'fa_d365_ready'],
      },
      {
        name: 'closed_by',
        token: '{{closed_by}}',
        desc: 'Factory acceptance approver',
        triggers: ['core_closed'],
      },
    ],
  },
  {
    group: 'D365 sync',
    vars: [
      {
        name: 'd365_stage',
        token: '{{d365_stage}}',
        desc: 'Dynamics 365 stage',
        triggers: ['fa_d365_ready'],
      },
    ],
  },
];

const editTemplate: EmailTemplateDraft = {
  code: 'core_closed',
  name: 'FA core closed notice',
  subject: 'FA {{fa_code}} closed',
  body: 'Hello, FA {{fa_code}} was closed by {{closed_by}}.',
  active: true,
  activeTo: ['ops@example.com'],
};

async function loadEmailTemplateEditModal() {
  const target = './email-template-edit-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);
  expect(
    module,
    'apps/web/components/settings/modals/email-template-edit-modal.tsx should exist and export SM-04 EmailTemplateEditModal',
  ).not.toBeNull();

  const component = module?.EmailTemplateEditModal ?? module?.default;
  expect(component, 'EmailTemplateEditModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );
  return component as React.ComponentType<EmailTemplateEditModalProps>;
}

async function renderEmailTemplateEditModal(overrides: Partial<EmailTemplateEditModalProps> = {}) {
  const EmailTemplateEditModal = await loadEmailTemplateEditModal();
  const props: EmailTemplateEditModalProps = {
    open: true,
    onOpenChange: vi.fn(),
    template: editTemplate,
    eventPayloadSchema: { variables: ['fa_code', 'closed_by', 'd365_stage'] },
    supportedTriggers,
    variableGroups,
    saveTemplate: vi.fn().mockResolvedValue({
      ok: true,
      templateCode: 'core_closed',
      revalidatedPath: '/settings/email-templates',
    }),
    ...overrides,
  };

  const rtl = render(<EmailTemplateEditModal {...props} />);
  return { ...rtl, props };
}

function getDialog() {
  return screen.getByRole('dialog', { name: /edit template.*core_closed|new email template/i });
}

function footerButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => name && !/^close$/i.test(name));
}

async function completeMetaStep(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const trigger = within(dialog).getByLabelText(/trigger code/i);
  if (trigger.tagName === 'BUTTON') {
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /core_closed/i }));
  } else if (!(trigger as HTMLInputElement).readOnly) {
    await user.clear(trigger);
    await user.type(trigger, 'core_closed');
  }
  await user.clear(within(dialog).getByRole('textbox', { name: /display name/i }));
  await user.type(within(dialog).getByRole('textbox', { name: /display name/i }), 'FA core closed notice');
  await user.click(within(dialog).getByRole('button', { name: /next/i }));
}

describe('SM-04 EmailTemplateEditModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the 3-step wizard structure, shadcn primitives, footer rules, focus order, and RTL parity snapshot', async () => {
    const user = userEvent.setup();
    const { container } = await renderEmailTemplateEditModal();
    const dialog = getDialog();

    expect(dialog).toHaveAttribute('data-modal-id', 'SM-04');
    expect(dialog).toHaveAttribute('data-size', 'wide');
    expect(within(dialog).getByText('Metadata')).toHaveAttribute('aria-current', 'step');
    expect(within(dialog).getByText('Subject + body')).toBeInTheDocument();
    expect(within(dialog).getByText('Review')).toBeInTheDocument();

    const code = within(dialog).getByLabelText(/trigger code/i);
    const name = within(dialog).getByRole('textbox', { name: /display name/i });
    const recipients = within(dialog).getByRole('textbox', { name: /active recipients \(to\)/i });
    expect(name.closest('[data-slot="input"]')).toBeTruthy();
    expect(recipients.closest('[data-slot="input"]')).toBeTruthy();
    expect(footerButtonNames(dialog).slice(-2)).toEqual(['Cancel', 'Next →']);

    expect(within(dialog).getByRole('button', { name: /next/i })).toBeEnabled();
    expect(code).toHaveAttribute('readonly');

    await user.click(within(dialog).getByRole('button', { name: /next/i }));
    const subject = within(dialog).getByRole('textbox', { name: /subject/i });
    const body = within(dialog).getByRole('textbox', { name: /^body/i });
    const variableSearch = within(dialog).getByRole('searchbox', { name: /search variables/i });
    expect(subject.closest('[data-slot="input"]')).toBeTruthy();
    expect(body.closest('[data-slot="textarea"]')).toBeTruthy();
    expect(variableSearch.closest('[data-slot="input"]')).toBeTruthy();
    expect(within(dialog).getByText('Variable picker')).toBeInTheDocument();
    expect(footerButtonNames(dialog).slice(-3)).toEqual(['← Back', 'Cancel', 'Next: review →']);

    await user.click(within(dialog).getByRole('button', { name: /next: review/i }));
    expect(within(dialog).getByText('Rendered preview (sample data)')).toBeInTheDocument();
    expect(within(dialog).getByText('Body length')).toBeInTheDocument();
    expect(footerButtonNames(dialog).slice(-3)).toEqual(['← Back', 'Cancel', 'Save template']);

    expect({
      modalId: dialog.getAttribute('data-modal-id'),
      title: within(dialog).getByRole('heading', { name: /edit template/i }).textContent,
      steps: ['Metadata', 'Subject + body', 'Review'],
      metaFields: ['Trigger code', 'Display name', 'Active recipients (To)'],
      bodyFields: ['Subject', 'Body', 'Variable picker', 'Search variables'],
      reviewRows: ['Trigger code', 'Display name', 'To (active)', 'Subject', 'Body length'],
      primitiveDrift: {
        rawSelects: dialog.querySelectorAll('select').length,
        rawDialogElement: dialog.tagName.toLowerCase() === 'dialog',
      },
    }).toMatchInlineSnapshot(`
      {
        "bodyFields": [
          "Subject",
          "Body",
          "Variable picker",
          "Search variables",
        ],
        "metaFields": [
          "Trigger code",
          "Display name",
          "Active recipients (To)",
        ],
        "modalId": "SM-04",
        "primitiveDrift": {
          "rawDialogElement": false,
          "rawSelects": 0,
        },
        "reviewRows": [
          "Trigger code",
          "Display name",
          "To (active)",
          "Subject",
          "Body length",
        ],
        "steps": [
          "Metadata",
          "Subject + body",
          "Review",
        ],
        "title": "Edit template — core_closed",
      }
    `);

    await assertModalA11y(container);
  });
});

describe('SM-04 EmailTemplateEditModal variable validation', () => {
  it('blocks navigation to review with UNKNOWN_TEMPLATE_VAR when body contains a token outside the event payload schema', async () => {
    const user = userEvent.setup();
    await renderEmailTemplateEditModal({
      template: { ...editTemplate, body: 'Valid body content with {{not_in_schema}}.' },
      eventPayloadSchema: { variables: ['fa_code', 'closed_by'] },
    });
    const dialog = getDialog();

    await completeMetaStep(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /next: review/i }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('UNKNOWN_TEMPLATE_VAR');
    expect(within(dialog).queryByText('Rendered preview (sample data)')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /next: review/i })).toBeDisabled();
  });

  it("filters the variable picker to variables starting with 'fa_' and inserts the selected token into the body", async () => {
    const user = userEvent.setup();
    await renderEmailTemplateEditModal();
    const dialog = getDialog();

    await completeMetaStep(user, dialog);
    await user.type(within(dialog).getByRole('searchbox', { name: /search variables/i }), 'fa_');

    expect(within(dialog).getByRole('button', { name: /fa_code/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /d365_stage/i })).not.toBeInTheDocument();

    const body = within(dialog).getByRole('textbox', { name: /^body/i });
    await user.click(within(dialog).getByRole('button', { name: /fa_code/i }));
    expect((body as HTMLTextAreaElement).value).toContain('{{fa_code}}');
  });

  it('exposes supported trigger codes in a selector for new templates (C023)', async () => {
    const user = userEvent.setup();
    await renderEmailTemplateEditModal({ template: undefined });
    const dialog = getDialog();

    expect(within(dialog).getByLabelText(/trigger code/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/core_closed/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/fa_d365_ready/i)).toBeInTheDocument();
    expect(within(dialog).queryByPlaceholderText('po_to_supplier')).not.toBeInTheDocument();

    await user.click(within(dialog).getByLabelText(/trigger code/i));
    await user.click(screen.getByRole('option', { name: /core_closed/i }));
    await user.type(within(dialog).getByRole('textbox', { name: /display name/i }), 'FA closed mail');
    expect(within(dialog).getByRole('button', { name: /next/i })).toBeEnabled();
  });
});
