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

type EmailTemplateEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplateDraft;
  eventPayloadSchema: { variables: string[] };
  variableGroups: EmailTemplateVariableGroup[];
  saveTemplate: (input: EmailTemplateDraft) => Promise<EmailTemplateSaveResult>;
};

const variableGroups: EmailTemplateVariableGroup[] = [
  {
    group: 'Factory acceptance',
    vars: [
      { name: 'fa_batch_code', token: '{{fa_batch_code}}', desc: 'Factory acceptance batch code' },
      { name: 'fa_released_by', token: '{{fa_released_by}}', desc: 'Factory acceptance approver' },
    ],
  },
  {
    group: 'Supplier',
    vars: [
      { name: 'supplier_email', token: '{{supplier_email}}', desc: 'Supplier primary email' },
      { name: 'po_number', token: '{{po_number}}', desc: 'Purchase order number' },
    ],
  },
];

const editTemplate: EmailTemplateDraft = {
  code: 'po_to_supplier',
  name: 'Purchase order → supplier',
  subject: 'PO {{po_number}} for {{supplier_email}}',
  body: 'Hello supplier, please confirm PO {{po_number}} before dispatch.',
  active: true,
  activeTo: ['{{supplier_email}}', 'procurement@example.com'],
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
    eventPayloadSchema: { variables: ['po_number', 'supplier_email', 'fa_batch_code', 'fa_released_by'] },
    variableGroups,
    saveTemplate: vi.fn().mockResolvedValue({
      ok: true,
      templateCode: 'po_to_supplier',
      revalidatedPath: '/settings/email-templates',
    }),
    ...overrides,
  };

  const rtl = render(<EmailTemplateEditModal {...props} />);
  return { ...rtl, props };
}

function getDialog() {
  return screen.getByRole('dialog', { name: /edit template.*po_to_supplier|new email template/i });
}

function footerButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => name && !/^close$/i.test(name));
}

async function completeMetaStep(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.clear(within(dialog).getByRole('textbox', { name: /trigger code/i }));
  await user.type(within(dialog).getByRole('textbox', { name: /trigger code/i }), 'po_to_supplier');
  await user.clear(within(dialog).getByRole('textbox', { name: /display name/i }));
  await user.type(within(dialog).getByRole('textbox', { name: /display name/i }), 'Purchase order supplier');
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

    const code = within(dialog).getByRole('textbox', { name: /trigger code/i });
    const name = within(dialog).getByRole('textbox', { name: /display name/i });
    const recipients = within(dialog).getByRole('textbox', { name: /active recipients \(to\)/i });
    expect(code.closest('[data-slot="input"]')).toBeTruthy();
    expect(name.closest('[data-slot="input"]')).toBeTruthy();
    expect(recipients.closest('[data-slot="input"]')).toBeTruthy();
    expect(footerButtonNames(dialog).slice(-2)).toEqual(['Cancel', 'Next →']);

    await user.clear(code);
    expect(within(dialog).getByRole('button', { name: /next/i })).toBeDisabled();
    await user.type(code, 'po_to_supplier');
    expect(within(dialog).getByRole('button', { name: /next/i })).toBeEnabled();
    expect(code).toHaveFocus();
    await user.tab();
    expect(name).toHaveFocus();
    await user.tab();
    expect(recipients).toHaveFocus();

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
        "title": "Edit template — po_to_supplier",
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
      eventPayloadSchema: { variables: ['po_number', 'supplier_email'] },
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

    expect(within(dialog).getByRole('button', { name: /fa_batch_code/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /fa_released_by/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /supplier_email/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /po_number/i })).not.toBeInTheDocument();

    const body = within(dialog).getByRole('textbox', { name: /^body/i });
    await user.click(within(dialog).getByRole('button', { name: /fa_batch_code/i }));
    expect(body).toHaveValue(expect.stringContaining('{{fa_batch_code}}'));
  });
});
