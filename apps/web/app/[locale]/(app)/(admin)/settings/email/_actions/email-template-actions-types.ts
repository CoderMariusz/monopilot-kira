export type TestSendInput = {
  provider: 'Resend' | 'Postmark' | 'SES';
  fromEmail: string;
  fromName: string;
};

export type TestSendResult = { ok: true; message_id: string } | { ok: false; error: string };

export type EmailTemplateDraft = {
  code: string;
  name: string;
  subject: string;
  body: string;
  active: boolean;
  activeTo: string[];
};

export type EmailTemplateSaveResult =
  | { ok: true; templateCode: string; revalidatedPath: '/settings/email' }
  | { ok: false; error: string };
