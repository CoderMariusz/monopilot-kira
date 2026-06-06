import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import DevicesScreen, {
  DEFAULT_DEVICES_LABELS,
  type DevicesScreenLabels,
} from './devices-screen.client';
import {
  pairDevice,
  readDevicesSettingsData,
  updateDeviceDefaults,
  type DeviceDefaultsRow,
  type DeviceRow,
} from './_actions/devices';

export const dynamic = 'force-dynamic';

const LABEL_NAMESPACE = 'settings.devices';
const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type LoadResult =
  | { state: 'ready'; devices: DeviceRow[]; defaults: DeviceDefaultsRow; canEdit: boolean }
  | { state: 'error' };

type QueryResult<T> = { rows: T[] };
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>> };
};

// Mirrors the permission predicate the devices Server Actions enforce
// (hasSettingsUpdatePermission in _actions/devices.ts) so the screen can render
// a read-only surface for users who lack settings.org.update. The actions remain
// the authoritative gate; this only drives UI affordances.
async function readCanEdit(context: OrgContextLike): Promise<boolean> {
  const { rows } = await context.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [context.userId, context.orgId, SETTINGS_UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

async function loadDevicesSettings(): Promise<LoadResult> {
  try {
    // readDevicesSettingsData wraps withOrgContext and returns { org_id, devices,
    // defaults }. The canEdit permission needs its own org-context round-trip; we
    // run it in parallel so the screen has the read-only/editable signal.
    const [data, canEdit] = await Promise.all([
      readDevicesSettingsData(),
      withOrgContext<boolean>((ctx) => readCanEdit(ctx as OrgContextLike)),
    ]);
    return { state: 'ready', devices: data.devices, defaults: data.defaults, canEdit };
  } catch (error) {
    console.error(
      '[settings/devices] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error' };
  }
}

const LABEL_KEYS_FLAT = [
  'title',
  'subtitle',
  'loadError',
  'saveError',
  'saveSuccess',
  'pairError',
  'pairSuccess',
  'readOnlyLabel',
  'readOnlyNotice',
] as const;

async function buildLabels(locale: string): Promise<DevicesScreenLabels> {
  try {
    const t = await getTranslations({ locale, namespace: LABEL_NAMESPACE });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key || value === `${LABEL_NAMESPACE}.${key}` ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const flat = Object.fromEntries(
      LABEL_KEYS_FLAT.map((key) => [key, pick(key, DEFAULT_DEVICES_LABELS[key])]),
    ) as Pick<DevicesScreenLabels, (typeof LABEL_KEYS_FLAT)[number]>;

    return {
      ...DEFAULT_DEVICES_LABELS,
      ...flat,
      kpi: {
        total: pick('kpi_total', DEFAULT_DEVICES_LABELS.kpi.total),
        online: pick('kpi_online', DEFAULT_DEVICES_LABELS.kpi.online),
        lowBattery: pick('kpi_low_battery', DEFAULT_DEVICES_LABELS.kpi.lowBattery),
        offline: pick('kpi_offline', DEFAULT_DEVICES_LABELS.kpi.offline),
      },
      table: {
        title: pick('table_title', DEFAULT_DEVICES_LABELS.table.title),
        deviceId: pick('table_device_id', DEFAULT_DEVICES_LABELS.table.deviceId),
        name: pick('table_name', DEFAULT_DEVICES_LABELS.table.name),
        model: pick('table_model', DEFAULT_DEVICES_LABELS.table.model),
        siteLine: pick('table_site_line', DEFAULT_DEVICES_LABELS.table.siteLine),
        battery: pick('table_battery', DEFAULT_DEVICES_LABELS.table.battery),
        lastSeen: pick('table_last_seen', DEFAULT_DEVICES_LABELS.table.lastSeen),
        status: pick('table_status', DEFAULT_DEVICES_LABELS.table.status),
        empty: pick('table_empty', DEFAULT_DEVICES_LABELS.table.empty),
        never: pick('table_never', DEFAULT_DEVICES_LABELS.table.never),
        noSite: pick('table_no_site', DEFAULT_DEVICES_LABELS.table.noSite),
      },
      status: {
        online: pick('status_online', DEFAULT_DEVICES_LABELS.status.online),
        offline: pick('status_offline', DEFAULT_DEVICES_LABELS.status.offline),
        lowBattery: pick('status_low_battery', DEFAULT_DEVICES_LABELS.status.lowBattery),
      },
      defaults: {
        title: pick('defaults_title', DEFAULT_DEVICES_LABELS.defaults.title),
        subtitle: pick('defaults_subtitle', DEFAULT_DEVICES_LABELS.defaults.subtitle),
        autoLock: pick('defaults_auto_lock', DEFAULT_DEVICES_LABELS.defaults.autoLock),
        autoLockHint: pick('defaults_auto_lock_hint', DEFAULT_DEVICES_LABELS.defaults.autoLockHint),
        loginPerShift: pick('defaults_login_per_shift', DEFAULT_DEVICES_LABELS.defaults.loginPerShift),
        offlineMode: pick('defaults_offline_mode', DEFAULT_DEVICES_LABELS.defaults.offlineMode),
        offlineModeHint: pick('defaults_offline_mode_hint', DEFAULT_DEVICES_LABELS.defaults.offlineModeHint),
      },
      autoLockOptions: {
        five: pick('auto_lock_5', DEFAULT_DEVICES_LABELS.autoLockOptions.five),
        ten: pick('auto_lock_10', DEFAULT_DEVICES_LABELS.autoLockOptions.ten),
        thirty: pick('auto_lock_30', DEFAULT_DEVICES_LABELS.autoLockOptions.thirty),
        sixty: pick('auto_lock_60', DEFAULT_DEVICES_LABELS.autoLockOptions.sixty),
      },
      actions: {
        pairDevice: pick('action_pair_device', DEFAULT_DEVICES_LABELS.actions.pairDevice),
        cancel: pick('action_cancel', DEFAULT_DEVICES_LABELS.actions.cancel),
        save: pick('action_save', DEFAULT_DEVICES_LABELS.actions.save),
        close: pick('action_close', DEFAULT_DEVICES_LABELS.actions.close),
      },
      pairModal: {
        title: pick('pair_title', DEFAULT_DEVICES_LABELS.pairModal.title),
        instructions: pick('pair_instructions', DEFAULT_DEVICES_LABELS.pairModal.instructions),
        nameLabel: pick('pair_name_label', DEFAULT_DEVICES_LABELS.pairModal.nameLabel),
        namePlaceholder: pick('pair_name_placeholder', DEFAULT_DEVICES_LABELS.pairModal.namePlaceholder),
        modelLabel: pick('pair_model_label', DEFAULT_DEVICES_LABELS.pairModal.modelLabel),
        modelPlaceholder: pick('pair_model_placeholder', DEFAULT_DEVICES_LABELS.pairModal.modelPlaceholder),
        submit: pick('pair_submit', DEFAULT_DEVICES_LABELS.pairModal.submit),
      },
    };
  } catch {
    return DEFAULT_DEVICES_LABELS;
  }
}

export default async function DevicesSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const [labels, result] = await Promise.all([buildLabels(locale), loadDevicesSettings()]);

  if (result.state === 'ready') {
    return (
      <DevicesScreen
        state="ready"
        devices={result.devices}
        defaults={result.defaults}
        canEdit={result.canEdit}
        labels={labels}
        pairDevice={pairDevice}
        updateDeviceDefaults={updateDeviceDefaults}
      />
    );
  }

  return <DevicesScreen state="error" labels={labels} />;
}
