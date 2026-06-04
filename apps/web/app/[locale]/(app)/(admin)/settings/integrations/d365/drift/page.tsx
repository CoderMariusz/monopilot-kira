import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasD365SyncPermission } from '../../../../../../../../lib/integrations/d365/rbac';
import D365DriftScreen, {
  type DriftActions,
  type DriftEvent,
  type DriftLabels,
  type PageState,
} from './d365-drift-screen.client';
import { bulkResolveDriftAction, resolveDriftAction } from './_actions/drift-actions';

export const dynamic = 'force-dynamic';

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
type ReadResult = { events: DriftEvent[]; canTrigger: boolean };

type D365DriftPageProps = {
  params?: Promise<{ locale: string }>;
  events?: DriftEvent[];
  canTrigger?: boolean;
  state?: PageState;
  actions?: DriftActions;
};

const LABEL_NAMESPACE = 'settings.d365.drift';

const DEFAULT_LABELS: DriftLabels = {
  title: 'D365 drift resolution',
  subtitle: 'Items where the MonoPilot value is newer than the incoming D365 value (V-TEC-73 — local edits win, overwrite was skipped). Accept applies an authorized, audited overwrite; Reject keeps the current value.',
  forbidden: 'Access denied. The technical.d365.sync_trigger permission is required to resolve D365 drift.',
  table: 'Drift events',
  selectAll: 'Select all drift events',
  selectRow: 'Select drift',
  driftId: 'Drift ID',
  entity: 'Entity',
  item: 'Item',
  mpValue: 'MP value',
  d365Value: 'D365 value',
  detected: 'Detected',
  actions: 'Actions',
  accept: 'Resolve',
  reject: 'Reject',
  bulkAccept: 'Accept selected',
  bulkReject: 'Reject selected',
  selectedCount: '{selected} selected',
  loading: 'Loading drift events…',
  empty: 'No open D365 drift events.',
  errorState: 'Unable to load D365 drift events.',
  count: '{count} events',
  notAvailable: '—',
  modalTitle: 'Resolve drift',
  destructive: 'Destructive — the losing system will be overwritten on the next sync. Choose the winning value, then record an audited reason.',
  directionMpWins: 'MP → D365',
  directionMpWinsHint: 'Keep the MonoPilot value; the export worker pushes it to D365 on the next sync.',
  directionD365Wins: 'D365 → MP',
  directionD365WinsHint: 'Overwrite the MonoPilot item with the D365 value (authorized, audited import).',
  reasonLabel: 'Reason',
  reasonHint: 'Audit-logged, min 10 chars.',
  reasonPlaceholder: 'e.g. Field corrected in MP — ECO-2044 awaiting sync.',
  cancel: 'Cancel',
  apply: 'Apply resolution',
  pending: 'Working…',
  actionFailed: 'Resolution failed. No drift was changed.',
};

async function buildLabels(locale: string): Promise<DriftLabels> {
  try {
    const t = await getTranslations({ locale });
    return (Object.keys(DEFAULT_LABELS) as Array<keyof DriftLabels>).reduce((labels, key) => {
      const messageKey = `${LABEL_NAMESPACE}.${key}`;
      try {
        const translated = t(messageKey);
        labels[key] = translated && translated !== messageKey ? translated : DEFAULT_LABELS[key];
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, { ...DEFAULT_LABELS });
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function firstDiffEntity(before: Record<string, unknown> | null, after: Record<string, unknown> | null): {
  entity: string;
  mp: string;
  d365: string;
} {
  const b = before ?? {};
  const a = after ?? {};
  // The drift writer records item_code / name / item_type on both sides. Surface
  // the first field that differs as the drifted entity; fall back to item_code.
  for (const field of ['item_code', 'name', 'item_type'] as const) {
    const mp = b[field];
    const d365 = a[field];
    if (mp !== undefined && d365 !== undefined && String(mp) !== String(d365)) {
      return { entity: `item.${field}`, mp: String(mp), d365: String(d365) };
    }
  }
  return {
    entity: 'item.item_code',
    mp: String(b.item_code ?? '—'),
    d365: String(a.item_code ?? '—'),
  };
}

function normalizeDrift(row: Record<string, unknown>): DriftEvent {
  const before = (row.before_state ?? null) as Record<string, unknown> | null;
  const after = (row.after_state ?? null) as Record<string, unknown> | null;
  const diff = firstDiffEntity(before, after);
  return {
    id: String(row.id),
    occurred_at: String(row.occurred_at),
    resource_id: String(row.resource_id),
    entity: diff.entity,
    item_code: String(before?.item_code ?? after?.item_code ?? '—'),
    mp_value: diff.mp,
    d365_value: diff.d365,
  };
}

async function readDriftData(): Promise<ReadResult> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const queryClient = client as unknown as QueryClient;
    const canTrigger = await hasD365SyncPermission(queryClient as never, userId, orgId);
    // Open drift = a d365_drift audit row with no later d365_drift_resolved row
    // for the same resource.
    const { rows } = await queryClient.query<Record<string, unknown>>(
      `select d.id, d.occurred_at, d.resource_id, d.before_state, d.after_state
         from public.audit_log d
        where d.org_id = app.current_org_id()
          and d.action = 'd365_drift'
          and d.resource_type = 'item'
          and not exists (
            select 1 from public.audit_log r
             where r.org_id = app.current_org_id()
               and r.action = 'd365_drift_resolved'
               and r.resource_type = 'item'
               and r.resource_id = d.resource_id
               and r.occurred_at > d.occurred_at
          )
        order by d.occurred_at desc
        limit 200`,
    );
    return { events: rows.map(normalizeDrift), canTrigger };
  });
}

export default async function D365DriftPage(propsInput: D365DriftPageProps = {}) {
  const params = propsInput.params ? await propsInput.params : { locale: 'en' };
  const labels = await buildLabels(params.locale ?? 'en');

  const injected = propsInput.events !== undefined || propsInput.canTrigger !== undefined || propsInput.state !== undefined;
  let state: PageState = propsInput.state ?? 'ready';
  let events: DriftEvent[] = propsInput.events ?? [];
  let canTrigger = propsInput.canTrigger ?? false;

  if (!injected) {
    try {
      const result = await readDriftData();
      events = result.events;
      canTrigger = result.canTrigger;
      if (!canTrigger && events.length === 0) {
        state = 'forbidden';
      }
    } catch {
      state = 'error';
    }
  }

  const actions: DriftActions = propsInput.actions ?? {
    resolve: resolveDriftAction,
    bulkResolve: bulkResolveDriftAction,
  };

  return (
    <D365DriftScreen
      events={events}
      canTrigger={canTrigger}
      labels={labels}
      state={state}
      actions={actions}
    />
  );
}
