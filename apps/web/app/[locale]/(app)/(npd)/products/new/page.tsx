/**
 * /{locale}/products/new — product create wizard (onboarding SET-004 entry).
 *
 * Server Component. The onboarding "first product" step links here with a
 * `returnTo` so a new org can create its first product (Finished Good) and bounce
 * back into onboarding. It reuses the real, Supabase-backed FG create flow:
 *   - labels: next-intl (npd.faCreateModal) with prototype fallback,
 *   - action: the T-008 createFa Server Action (imported, never re-authored),
 *     injected ONLY when RBAC grants `fg.create` (resolved server-side here),
 *   - returnTo: honored client-side after a successful create / cancel.
 *
 * Before this route existed the link 404'd (next-intl localized /products/new to
 * /{locale}/products/new with no matching page), which dropped the user out of
 * onboarding.
 */

import { getTranslations } from 'next-intl/server';

import { exampleCodeMask } from '../../../../../../lib/documents/code-mask';
import { ProductCreateWizard } from './product-create-wizard.client';
import {
  type CreateFaAction,
  type FaCreateLabels,
} from '../../../../../(npd)/fa/_components/fa-create-modal';
import { createFa } from '../../../../../(npd)/fa/actions/create-fa';
import { DuplicateError } from '../../../../../(npd)/fa/actions/errors';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const CREATE_PERMISSION = 'fg.create';

const DEFAULT_LABELS: FaCreateLabels = {
  title: 'Create Finished Good',
  subtitle: 'V01 · FG Code required. V02 · Product Name required.',
  fieldProductCode: 'FG Code',
  fieldProductCodeHint: 'Enter the product code (uppercase letters/digits, e.g. FA5609). The prefix is configurable in product settings.',
  fieldProductName: 'Product Name',
  fieldProductNameHint: 'Max 200 chars',
  rangeHint: 'The product-code prefix is configurable in product settings.',
  cancel: 'Cancel',
  create: 'Create FG',
  creating: 'Creating…',
  errorV01: 'FG Code is required.',
  errorV02: 'Product Name is required (max 200 chars).',
  errorDuplicate: 'FG Code already exists. Choose a different code.',
  errorGeneric: 'Could not create the Finished Good. Try again.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FaCreateLabels>;

// The product-code prefix is no longer hardcoded to 'FA' here (it will become
// configurable in product settings). The shared `npd.faCreateModal` i18n
// namespace is also consumed by the strict FA-list create modal, whose copy
// must keep describing the 'FA' rule — so for this onboarding wizard we always
// use the relaxed in-file copy for the prefix-related keys instead of the
// shared translations, across every locale.
const PREFIX_AGNOSTIC_KEYS: ReadonlySet<keyof FaCreateLabels> = new Set([
  'subtitle',
  'fieldProductCodeHint',
  'rangeHint',
  'errorV01',
]);

function translateLabel(t: (key: string) => string, key: keyof FaCreateLabels): string {
  if (PREFIX_AGNOSTIC_KEYS.has(key)) return DEFAULT_LABELS[key];
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function resolveFgCodeMask(): Promise<string | null> {
  try {
    return await withOrgContext(async (rawCtx): Promise<string | null> => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ code_mask: string | null }>(
        `select code_mask
           from public.org_document_settings
          where org_id = app.current_org_id()
            and doc_type = 'fg'
          limit 1`,
      );
      return rows[0]?.code_mask ?? null;
    });
  } catch (error) {
    console.error('[products/new] fg code-mask lookup failed:', error);
    return null;
  }
}

function maskExample(mask: string): string {
  return exampleCodeMask(mask);
}

async function buildMaskAwareLabels(locale: string, fgCodeMask: string | null): Promise<FaCreateLabels> {
  const labels = await buildLabels(locale);
  if (!fgCodeMask) return labels;

  const example = maskExample(fgCodeMask);
  try {
    const t = await getTranslations({ locale, namespace: 'npd.productCreateWizard' });
    labels.fieldProductCodeHint = t('fieldProductCodeHintMask', { example });
    labels.rangeHint = t('rangeHintMask', { example });
    labels.errorV01 = t('errorV01Mask', { example });
    labels.subtitle = t('subtitleMask');
  } catch {
    labels.fieldProductCodeHint = `Enter a code matching your org FG format (e.g. ${example}).`;
    labels.rangeHint = `Product codes follow your org FG format (e.g. ${example}).`;
    labels.errorV01 = `FG Code must match your org format (e.g. ${example}).`;
    labels.subtitle = 'V01 · FG Code must match your org format. V02 · Product Name required.';
  }
  return labels;
}

async function buildLabels(locale: string): Promise<FaCreateLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faCreateModal' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as FaCreateLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

// Server Action adapter (RHF input → T-008 createFa). Mirrors fa-create-host.
// Catches DuplicateError SERVER-SIDE and returns it as a serializable result so
// the modal can show the friendly "already exists" message (a thrown custom error
// is flattened to a generic Error at the RSC→client boundary). All other errors
// keep throwing (generic fallback); createFa's own throw contract is unchanged.
const createFaAction: CreateFaAction = async (input) => {
  'use server';
  try {
    return await createFa(input);
  } catch (error) {
    if (
      error instanceof DuplicateError ||
      (typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'DUPLICATE_PRODUCT_CODE')
    ) {
      return { ok: false, error: 'already_exists' };
    }
    throw error;
  }
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function resolveCanCreate(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx): Promise<boolean> => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
          limit 1`,
        [ctx.userId, ctx.orgId, CREATE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch (error) {
    console.error('[products/new] permission check failed:', error);
    return false;
  }
}

type ProductNewPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
  // Test seams (mirror fa/page.tsx convention): bypass DB/RBAC resolution.
  canCreate?: boolean;
  fgCodeMask?: string | null;
};

export default async function ProductNewPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProductNewPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const search = props.searchParams ? await props.searchParams : {};

  const fgCodeMask = props.fgCodeMask ?? (await resolveFgCodeMask());
  const labels = await buildMaskAwareLabels(locale, fgCodeMask);
  const canCreate = props.canCreate ?? (await resolveCanCreate());

  return (
    <ProductCreateWizard
      labels={labels}
      createFaAction={canCreate ? createFaAction : undefined}
      locale={locale}
      returnTo={search.returnTo}
      fgCodeMask={fgCodeMask}
    />
  );
}
