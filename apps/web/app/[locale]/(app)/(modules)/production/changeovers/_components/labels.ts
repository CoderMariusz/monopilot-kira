/**
 * B-2 — Changeover dual-sign screen label shapes (props-down i18n).
 *
 * The server page resolves every string via next-intl `getTranslations(
 * 'production.changeovers')` and passes these objects down so the client islands
 * carry no inline copy. Mirrors the production module's labels-as-props pattern
 * (e.g. wo-modal-labels.ts / changeover-table.tsx).
 */

export type ChangeoverFilterStatus = 'all' | 'pending' | 'first_signed' | 'complete';

export type ChangeoverListLabels = {
  title: string;
  subtitle: string;
  newButton: string;
  filters: Record<ChangeoverFilterStatus, string>;
  loading: string;
  empty: string;
  error: string;
  denied: string;
  col: {
    line: string;
    transition: string;
    cleaning: string;
    atp: string;
    status: string;
    signers: string;
  };
  cleaningYes: string;
  cleaningNo: string;
  none: string;
  status: Record<'pending' | 'first_signed' | 'complete', string>;
  signerNone: string;
  reviewButton: string;
};

export type ChangeoverCreateLabels = {
  title: string;
  subtitle: string;
  line: string;
  linePlaceholder: string;
  fromProduct: string;
  toProduct: string;
  cleaning: string;
  atp: string;
  atpPlaceholder: string;
  notes: string;
  notesPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
  clearProduct: string;
  validation: { lineRequired: string; toProductRequired: string };
  errors: { forbidden: string; invalid_input: string; generic: string };
};

export type ChangeoverSignLabels = {
  title: string;
  subtitle: string;
  firstSlot: string;
  secondSlot: string;
  signedBy: string;
  signedAt: string;
  awaiting: string;
  signFirst: string;
  signSecond: string;
  completeBanner: string;
  close: string;
  esign: {
    title: string;
    meaning: string;
    password: string;
    passwordPlaceholder: string;
    passwordHelp: string;
    submit: string;
    submitting: string;
    cancel: string;
    passwordRequired: string;
  };
  errors: {
    forbidden: string;
    wrong_role: string;
    same_user: string;
    same_user_rejected: string;
    invalid_state: string;
    cleaning_incomplete: string;
    esign_failed: string;
    generic: string;
  };
};

export type ChangeoversScreenLabels = {
  breadcrumb: { production: string; changeovers: string };
  list: ChangeoverListLabels;
  create: ChangeoverCreateLabels;
  sign: ChangeoverSignLabels;
};
