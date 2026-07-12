/**
 * Shared procurement supplier resolution for an item — same precedence manual PO
 * creation uses (supplier_specs link + open PO history), with an optional
 * reorder-threshold preferred supplier taking priority when supplied.
 */
export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ItemSupplierResolution = {
  itemId: string;
  supplierId: string;
  source: 'preferred' | 'open_po' | 'supplier_spec';
};

const NON_BLOCKED_SUPPLIER_FILTER = `s.status <> 'blocked'`;

/**
 * Resolve suppliers for many items in two org-scoped reads. Callers merge with
 * their preferred_supplier_id (threshold) first — that wins when set and not blocked.
 */
export async function resolveProcurementSuppliersForItems(
  client: QueryClient,
  itemIds: readonly string[],
  openPoStatuses: readonly string[],
): Promise<Map<string, ItemSupplierResolution>> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  const resolved = new Map<string, ItemSupplierResolution>();
  if (uniqueIds.length === 0) return resolved;

  const { rows: openPoRows } = await client.query<{ item_id: string; supplier_id: string }>(
    `select distinct on (l.item_id)
            l.item_id::text as item_id,
            po.supplier_id::text as supplier_id
       from public.purchase_order_lines l
       join public.purchase_orders po
         on po.id = l.po_id
        and po.org_id = app.current_org_id()
        and po.status = any($2::text[])
       join public.suppliers s
         on s.id = po.supplier_id
        and s.org_id = po.org_id
        and ${NON_BLOCKED_SUPPLIER_FILTER}
      where l.org_id = app.current_org_id()
        and l.item_id = any($1::uuid[])
      order by l.item_id, po.updated_at desc nulls last, po.created_at desc nulls last`,
    [uniqueIds, openPoStatuses],
  );
  for (const row of openPoRows) {
    if (row.supplier_id) {
      resolved.set(row.item_id, {
        itemId: row.item_id,
        supplierId: row.supplier_id,
        source: 'open_po',
      });
    }
  }

  const unresolved = uniqueIds.filter((id) => !resolved.has(id));
  if (unresolved.length === 0) return resolved;

  const { rows: specRows } = await client.query<{ item_id: string; supplier_id: string }>(
    `select distinct on (ss.item_id)
            ss.item_id::text as item_id,
            coalesce(s_by_id.id, s_by_code.id)::text as supplier_id
       from public.supplier_specs ss
       left join public.suppliers s_by_id
         on s_by_id.org_id = ss.org_id
        and s_by_id.id = ss.supplier_id
        and ${NON_BLOCKED_SUPPLIER_FILTER}
       left join public.suppliers s_by_code
         on s_by_code.org_id = ss.org_id
        and s_by_code.code = ss.supplier_code
        and ss.supplier_id is null
        and ${NON_BLOCKED_SUPPLIER_FILTER}
      where ss.org_id = app.current_org_id()
        and ss.item_id = any($1::uuid[])
        and ss.lifecycle_status = 'active'
        and ss.review_status = 'approved'
        and coalesce(s_by_id.id, s_by_code.id) is not null
      order by ss.item_id, ss.effective_from desc nulls last, ss.updated_at desc nulls last`,
    [unresolved],
  );
  for (const row of specRows) {
    if (!resolved.has(row.item_id) && row.supplier_id) {
      resolved.set(row.item_id, {
        itemId: row.item_id,
        supplierId: row.supplier_id,
        source: 'supplier_spec',
      });
    }
  }

  return resolved;
}

export async function fetchNonBlockedSupplierIds(
  client: QueryClient,
  supplierIds: readonly string[],
): Promise<Set<string>> {
  const uniqueIds = [...new Set(supplierIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();
  const { rows } = await client.query<{ id: string }>(
    `select s.id::text as id
       from public.suppliers s
      where s.org_id = app.current_org_id()
        and s.id = any($1::uuid[])
        and ${NON_BLOCKED_SUPPLIER_FILTER}`,
    [uniqueIds],
  );
  return new Set(rows.map((row) => row.id));
}

export function pickProcurementSupplierId(
  itemId: string,
  preferredSupplierId: string | null | undefined,
  resolved: Map<string, ItemSupplierResolution>,
  eligibleSupplierIds?: ReadonlySet<string>,
): string | null {
  const isEligible = (supplierId: string) => !eligibleSupplierIds || eligibleSupplierIds.has(supplierId);
  if (preferredSupplierId && isEligible(preferredSupplierId)) return preferredSupplierId;
  const fromResolved = resolved.get(itemId);
  if (fromResolved && isEligible(fromResolved.supplierId)) return fromResolved.supplierId;
  return null;
}
