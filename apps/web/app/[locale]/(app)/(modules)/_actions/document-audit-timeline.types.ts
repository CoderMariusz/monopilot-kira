export const DOCUMENT_AUDIT_ENTITY_TYPES = [
  'purchase_order',
  'transfer_order',
  'sales_order',
  'grn',
  'quality_hold',
  'ncr_report',
  'license_plate',
] as const;

export type DocumentAuditEntityType = (typeof DOCUMENT_AUDIT_ENTITY_TYPES)[number];

export type DocumentAuditTimelineSource = 'audit_events' | 'audit_log' | 'status_history';

export type DocumentAuditTimelineRow = {
  /** Stable composite id for React keys. */
  id: string;
  source: DocumentAuditTimelineSource;
  occurredAt: string;
  actorName: string | null;
  actorUserId: string | null;
  action: string;
  /** Structured diff / transition payload when present. */
  details: unknown | null;
};

export type DocumentAuditTimelineResult = {
  rows: DocumentAuditTimelineRow[];
  total: number;
  hasMore: boolean;
};

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export type GetDocumentAuditTimelineOptions = {
  client: QueryClient;
  limit?: number;
  offset?: number;
};

type EntityConfig = {
  resourceTypes: readonly string[];
  grnItemScope?: boolean;
  statusHistory: 'lp' | 'grn' | null;
};

export const ENTITY_AUDIT_CONFIG: Record<DocumentAuditEntityType, EntityConfig> = {
  purchase_order: { resourceTypes: ['purchase_order'], statusHistory: null },
  transfer_order: { resourceTypes: ['transfer_order'], statusHistory: null },
  sales_order: { resourceTypes: ['sales_order'], statusHistory: null },
  grn: { resourceTypes: ['grn', 'grn_item'], grnItemScope: true, statusHistory: 'grn' },
  quality_hold: { resourceTypes: ['quality_hold'], statusHistory: null },
  ncr_report: { resourceTypes: ['ncr_report', 'ncr'], statusHistory: null },
  license_plate: { resourceTypes: ['license_plate'], statusHistory: 'lp' },
};

export const DEFAULT_TIMELINE_PAGE_SIZE = 50;

export type LoadDocumentAuditTimelineInput = {
  entityType: DocumentAuditEntityType;
  entityId: string;
  limit?: number;
  offset?: number;
};

export type LoadDocumentAuditTimelineResult =
  | { ok: true; data: DocumentAuditTimelineResult }
  | { ok: false; error: 'invalid_input' | 'forbidden' };
