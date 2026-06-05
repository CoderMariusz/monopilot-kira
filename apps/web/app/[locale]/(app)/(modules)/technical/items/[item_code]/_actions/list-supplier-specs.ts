'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { type OrgActionContext, type QueryClient } from '../../_actions/shared';

const ItemCodeInput = z.string().trim().min(1).max(64);

export type SupplierSpecRow = {
  id: string;
  itemCode: string;
  itemName: string;
  supplierCode: string;
  supplierStatus: string;
  lifecycleStatus: string;
  reviewStatus: string;
  specVersion: string;
  issuedDate: string | null;
  effectiveFrom: string | null;
  expiryDate: string | null;
  specDocumentUrl: string | null;
  documentSha256: string | null;
  documentMimeType: string | null;
  certificateRefs: unknown[];
  uploadedAt: string | null;
};

export type SupplierSpecsData = {
  state: 'ready' | 'empty' | 'error';
  itemCode: string;
  specs: SupplierSpecRow[];
  emptyState: { reason: 'item_not_found' | 'no_supplier_specs' } | null;
};

type SupplierSpecSqlRow = {
  id: string | null;
  item_code: string;
  item_name: string;
  supplier_code: string;
  supplier_status: string;
  lifecycle_status: string;
  review_status: string;
  spec_version: string;
  issued_date: string | Date | null;
  effective_from: string | Date | null;
  expiry_date: string | Date | null;
  spec_document_url: string | null;
  document_sha256: string | null;
  document_mime_type: string | null;
  certificate_refs: unknown;
  uploaded_at: string | Date | null;
};

export async function listSupplierSpecs(itemCode: string): Promise<SupplierSpecsData> {
  const parsed = ItemCodeInput.safeParse(itemCode);
  if (!parsed.success) {
    return { state: 'error', itemCode: String(itemCode ?? ''), specs: [], emptyState: null };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SupplierSpecsData> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const { rows } = await ctx.client.query<SupplierSpecSqlRow>(
        `select ss.id,
                i.item_code,
                i.name as item_name,
                ss.supplier_code,
                ss.supplier_status,
                ss.lifecycle_status,
                ss.review_status,
                ss.spec_version,
                ss.issued_date,
                ss.effective_from,
                ss.expiry_date,
                ss.spec_document_url,
                ss.document_sha256,
                ss.document_mime_type,
                ss.certificate_refs,
                ss.uploaded_at
           from public.items i
           left join public.supplier_specs ss
             on ss.org_id = i.org_id
            and ss.item_id = i.id
          where i.org_id = app.current_org_id()
            and i.item_code = $1
          order by ss.effective_from desc nulls last, ss.uploaded_at desc nulls last`,
        [parsed.data],
      );

      if (rows.length === 0) {
        return {
          state: 'empty',
          itemCode: parsed.data,
          specs: [],
          emptyState: { reason: 'item_not_found' },
        };
      }

      const specs: SupplierSpecRow[] = rows
        .filter((row) => row.id !== null)
        .map((row) => ({
          id: String(row.id),
          itemCode: row.item_code,
          itemName: row.item_name,
          supplierCode: row.supplier_code,
          supplierStatus: row.supplier_status,
          lifecycleStatus: row.lifecycle_status,
          reviewStatus: row.review_status,
          specVersion: row.spec_version,
          issuedDate: toIso(row.issued_date),
          effectiveFrom: toIso(row.effective_from),
          expiryDate: toIso(row.expiry_date),
          specDocumentUrl: row.spec_document_url,
          documentSha256: row.document_sha256,
          documentMimeType: row.document_mime_type,
          certificateRefs: Array.isArray(row.certificate_refs) ? row.certificate_refs : [],
          uploadedAt: toIso(row.uploaded_at),
        }));

      return specs.length > 0
        ? { state: 'ready', itemCode: parsed.data, specs, emptyState: null }
        : {
            state: 'empty',
            itemCode: parsed.data,
            specs: [],
            emptyState: { reason: 'no_supplier_specs' },
          };
    });
  } catch (error) {
    console.error('[technical/items] listSupplierSpecs load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { state: 'error', itemCode: parsed.data, specs: [], emptyState: null };
  }
}

function toIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
