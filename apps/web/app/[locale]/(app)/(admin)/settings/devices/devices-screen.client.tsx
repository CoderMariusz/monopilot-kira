'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';

import { PageHead, Section, SelectField, SRow, Toggle } from '../_components';
import type {
  DeviceDefaultsRow,
  DeviceRow,
  DeviceStatus,
  PairDeviceInput,
  PairDeviceResult,
  UpdateDeviceDefaultsInput,
  UpdateDeviceDefaultsResult,
} from './_actions/devices';

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/ops-screens.jsx:4-95';

export type DevicesScreenLabels = {
  title: string;
  subtitle: string;
  loadError: string;
  saveError: string;
  saveSuccess: string;
  pairError: string;
  pairSuccess: string;
  readOnlyLabel: string;
  readOnlyNotice: string;
  kpi: {
    total: string;
    online: string;
    lowBattery: string;
    offline: string;
  };
  table: {
    title: string;
    deviceId: string;
    name: string;
    model: string;
    siteLine: string;
    battery: string;
    lastSeen: string;
    status: string;
    empty: string;
    never: string;
    noSite: string;
  };
  status: {
    online: string;
    offline: string;
    lowBattery: string;
  };
  defaults: {
    title: string;
    subtitle: string;
    autoLock: string;
    autoLockHint: string;
    loginPerShift: string;
    offlineMode: string;
    offlineModeHint: string;
  };
  autoLockOptions: {
    five: string;
    ten: string;
    thirty: string;
    sixty: string;
  };
  actions: {
    pairDevice: string;
    cancel: string;
    save: string;
    close: string;
  };
  pairModal: {
    title: string;
    instructions: string;
    nameLabel: string;
    namePlaceholder: string;
    modelLabel: string;
    modelPlaceholder: string;
    submit: string;
  };
};

export const DEFAULT_DEVICES_LABELS: DevicesScreenLabels = {
  title: 'Scanner devices',
  subtitle: 'Handheld scanners and tablets paired to Monopilot.',
  loadError: 'Scanner devices could not be loaded.',
  saveError: 'Device defaults could not be saved.',
  saveSuccess: 'Device defaults saved.',
  pairError: 'Device could not be paired.',
  pairSuccess: 'Device paired.',
  readOnlyLabel: 'Read-only',
  readOnlyNotice: 'You need settings.org.update to pair devices or change defaults.',
  kpi: {
    total: 'Total devices',
    online: 'Online now',
    lowBattery: 'Low battery',
    offline: 'Offline',
  },
  table: {
    title: 'Paired devices',
    deviceId: 'Device ID',
    name: 'Name',
    model: 'Model',
    siteLine: 'Site / Line',
    battery: 'Battery',
    lastSeen: 'Last seen',
    status: 'Status',
    empty: 'No devices paired yet. Pair your first scanner to get started.',
    never: 'Never',
    noSite: 'Unassigned',
  },
  status: {
    online: 'Online',
    offline: 'Offline',
    lowBattery: 'Low battery',
  },
  defaults: {
    title: 'Device defaults',
    subtitle: 'Applied to newly paired devices.',
    autoLock: 'Force auto-lock',
    autoLockHint: 'Lock the app after inactivity.',
    loginPerShift: 'Require login per shift',
    offlineMode: 'Offline mode',
    offlineModeHint: 'Allow scanning when disconnected (syncs on reconnect).',
  },
  autoLockOptions: {
    five: '5 minutes',
    ten: '10 minutes',
    thirty: '30 minutes',
    sixty: '60 minutes',
  },
  actions: {
    pairDevice: '+ Pair device',
    cancel: 'Cancel',
    save: 'Save changes',
    close: 'Close',
  },
  pairModal: {
    title: 'Pair new device',
    instructions: 'Register a new scanner. It will appear online once it connects.',
    nameLabel: 'Device name',
    namePlaceholder: 'e.g. Line 1 scanner',
    modelLabel: 'Model',
    modelPlaceholder: 'e.g. Zebra TC52',
    submit: 'Pair device',
  },
};

const FALLBACK_DEFAULTS: DeviceDefaultsRow = {
  auto_lock_minutes: 5,
  login_per_shift: true,
  offline_mode: true,
  org_id: '',
};

const AUTO_LOCK_VALUES = [5, 10, 30, 60] as const;

export type DevicesScreenProps = {
  state?: 'ready' | 'error';
  devices?: DeviceRow[];
  defaults?: DeviceDefaultsRow;
  canEdit?: boolean;
  labels?: DevicesScreenLabels;
  pairDevice?: (input: PairDeviceInput) => Promise<PairDeviceResult> | PairDeviceResult;
  updateDeviceDefaults?: (
    input: UpdateDeviceDefaultsInput,
  ) => Promise<UpdateDeviceDefaultsResult> | UpdateDeviceDefaultsResult;
};

function batteryTone(level: number): 'green' | 'amber' | 'red' {
  if (level > 50) return 'green';
  if (level > 20) return 'amber';
  return 'red';
}

function statusBadgeClass(status: DeviceStatus): string {
  switch (status) {
    case 'online':
      return 'badge badge-green';
    case 'low_battery':
      return 'badge badge-amber';
    case 'offline':
    default:
      return 'badge badge-red';
  }
}

function statusLabel(status: DeviceStatus, labels: DevicesScreenLabels): string {
  switch (status) {
    case 'online':
      return labels.status.online;
    case 'low_battery':
      return labels.status.lowBattery;
    case 'offline':
    default:
      return labels.status.offline;
  }
}

function formatLastSeen(value: string | null, labels: DevicesScreenLabels): string {
  if (!value) return labels.table.never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function autoLockLabel(minutes: number, labels: DevicesScreenLabels): string {
  switch (minutes) {
    case 5:
      return labels.autoLockOptions.five;
    case 10:
      return labels.autoLockOptions.ten;
    case 30:
      return labels.autoLockOptions.thirty;
    case 60:
      return labels.autoLockOptions.sixty;
    default:
      return `${minutes} minutes`;
  }
}

export default function DevicesScreen(rawProps: DevicesScreenProps = {}) {
  const router = useRouter();
  const labels = rawProps.labels ?? DEFAULT_DEVICES_LABELS;
  const state = rawProps.state ?? 'ready';
  const devices = rawProps.devices ?? [];
  const canEdit = rawProps.canEdit ?? false;
  const incomingDefaults = rawProps.defaults ?? FALLBACK_DEFAULTS;
  const pairDeviceAction = rawProps.pairDevice;
  const updateDefaultsAction = rawProps.updateDeviceDefaults;

  const [savedDefaults, setSavedDefaults] = React.useState<DeviceDefaultsRow>(incomingDefaults);
  const [draftDefaults, setDraftDefaults] = React.useState<DeviceDefaultsRow>(incomingDefaults);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const [showPair, setShowPair] = React.useState(false);
  const [pairName, setPairName] = React.useState('');
  const [pairModel, setPairModel] = React.useState('');
  const [isPairing, setIsPairing] = React.useState(false);
  const [pairError, setPairError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSavedDefaults(incomingDefaults);
    setDraftDefaults(incomingDefaults);
    setMessage(null);
    setError(null);
  }, [incomingDefaults]);

  if (state === 'error') {
    return (
      <main
        aria-label={labels.title}
        className="mx-auto grid max-w-5xl gap-3 p-6"
        data-prototype-source={PROTOTYPE_SOURCE}
      >
        <PageHead title={labels.title} sub={labels.subtitle} />
        <div className="alert alert-red" role="alert">
          {labels.loadError}
        </div>
      </main>
    );
  }

  const total = devices.length;
  const online = devices.filter((device) => device.status === 'online').length;
  const lowBattery = devices.filter((device) => device.status === 'low_battery').length;
  const offline = devices.filter((device) => device.status === 'offline').length;

  const defaultsDirty =
    draftDefaults.auto_lock_minutes !== savedDefaults.auto_lock_minutes ||
    draftDefaults.login_per_shift !== savedDefaults.login_per_shift ||
    draftDefaults.offline_mode !== savedDefaults.offline_mode;
  const controlsDisabled = !canEdit || isSaving;

  const autoLockOptions = AUTO_LOCK_VALUES.map((value) => ({
    value: String(value),
    label: autoLockLabel(value, labels),
  }));

  function updateDefault<K extends keyof DeviceDefaultsRow>(key: K, value: DeviceDefaultsRow[K]) {
    setDraftDefaults((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  async function handleSaveDefaults() {
    if (!canEdit || !defaultsDirty || isSaving) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateDefaultsAction?.({
        auto_lock_minutes: draftDefaults.auto_lock_minutes,
        login_per_shift: draftDefaults.login_per_shift,
        offline_mode: draftDefaults.offline_mode,
      });
      if (result?.ok) {
        setSavedDefaults(result.data);
        setDraftDefaults(result.data);
        setMessage(labels.saveSuccess);
        router.refresh?.();
      } else {
        setError(labels.saveError);
      }
    } catch {
      setError(labels.saveError);
    } finally {
      setIsSaving(false);
    }
  }

  function closePairModal() {
    setShowPair(false);
    setPairName('');
    setPairModel('');
    setPairError(null);
    setIsPairing(false);
  }

  async function handlePairSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || isPairing) return;
    if (pairName.trim().length === 0 || pairModel.trim().length === 0) {
      setPairError(labels.pairError);
      return;
    }
    setIsPairing(true);
    setPairError(null);
    try {
      const result = await pairDeviceAction?.({ name: pairName.trim(), model: pairModel.trim() });
      if (result?.ok) {
        setMessage(labels.pairSuccess);
        setError(null);
        closePairModal();
        router.refresh?.();
      } else {
        setPairError(labels.pairError);
        setIsPairing(false);
      }
    } catch {
      setPairError(labels.pairError);
      setIsPairing(false);
    }
  }

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          canEdit ? (
            <Button className="btn-primary" type="button" onClick={() => setShowPair(true)}>
              {labels.actions.pairDevice}
            </Button>
          ) : null
        }
      />

      {!canEdit ? (
        <div aria-label={labels.readOnlyLabel} className="alert alert-amber" role="note">
          <div className="alert-title">{labels.readOnlyLabel}</div>
          {labels.readOnlyNotice}
        </div>
      ) : null}

      {message ? (
        <div className="alert alert-green" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-red" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className="kpi-row"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        data-testid="devices-kpis"
      >
        <div className="kpi">
          <div className="kpi-label">{labels.kpi.total}</div>
          <div className="kpi-value">{total}</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">{labels.kpi.online}</div>
          <div className="kpi-value">{online}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">{labels.kpi.lowBattery}</div>
          <div className="kpi-value">{lowBattery}</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">{labels.kpi.offline}</div>
          <div className="kpi-value">{offline}</div>
        </div>
      </div>

      <Section title={labels.table.title}>
        {devices.length === 0 ? (
          <div className="empty-state" role="status" data-testid="devices-empty">
            <div className="empty-state-icon">▤</div>
            <div className="empty-state-body">{labels.table.empty}</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{labels.table.deviceId}</th>
                <th>{labels.table.name}</th>
                <th>{labels.table.model}</th>
                <th>{labels.table.siteLine}</th>
                <th>{labels.table.battery}</th>
                <th>{labels.table.lastSeen}</th>
                <th>{labels.table.status}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td className="mono">{device.id}</td>
                  <td style={{ fontWeight: 500 }}>{device.name}</td>
                  <td className="muted">{device.model}</td>
                  <td>
                    {device.site_id ?? labels.table.noSite}
                    {device.line_id ? (
                      <>
                        {' · '}
                        <span className="muted">{device.line_id}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 40,
                          height: 5,
                          background: 'var(--gray-100)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${device.battery_level}%`,
                            height: '100%',
                            background: `var(--${batteryTone(device.battery_level)})`,
                          }}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: 11 }}>
                        {device.battery_level}%
                      </span>
                    </div>
                  </td>
                  <td className="mono muted">{formatLastSeen(device.last_seen_at, labels)}</td>
                  <td>
                    <span className={statusBadgeClass(device.status)}>
                      {statusLabel(device.status, labels)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={labels.defaults.title}
        sub={labels.defaults.subtitle}
        foot={
          canEdit ? (
            <>
              <Button
                className="btn-ghost"
                disabled={!defaultsDirty || isSaving}
                type="button"
                onClick={() => setDraftDefaults(savedDefaults)}
              >
                {labels.actions.cancel}
              </Button>
              <Button
                className="btn-primary"
                disabled={!defaultsDirty || isSaving}
                type="button"
                onClick={() => void handleSaveDefaults()}
              >
                {labels.actions.save}
              </Button>
            </>
          ) : null
        }
      >
        <SelectField
          id="devices-auto-lock"
          label={labels.defaults.autoLock}
          hint={labels.defaults.autoLockHint}
          options={autoLockOptions}
          value={String(draftDefaults.auto_lock_minutes)}
          disabled={controlsDisabled}
          onChange={(value) => updateDefault('auto_lock_minutes', Number(value))}
        />
        <SRow label={labels.defaults.loginPerShift}>
          <Toggle
            aria-label={labels.defaults.loginPerShift}
            checked={draftDefaults.login_per_shift}
            disabled={controlsDisabled}
            onChange={(value) => updateDefault('login_per_shift', value)}
          />
        </SRow>
        <SRow label={labels.defaults.offlineMode} hint={labels.defaults.offlineModeHint}>
          <Toggle
            aria-label={labels.defaults.offlineMode}
            checked={draftDefaults.offline_mode}
            disabled={controlsDisabled}
            onChange={(value) => updateDefault('offline_mode', value)}
          />
        </SRow>
      </Section>

      <Modal open={showPair} onOpenChange={(open) => (open ? setShowPair(true) : closePairModal())} size="sm" modalId="settings-devices-pair">
        <Modal.Header title={labels.pairModal.title} />
        <form onSubmit={(event) => void handlePairSubmit(event)}>
          <Modal.Body>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {labels.pairModal.instructions}
            </p>
            {pairError ? (
              <div className="alert alert-red" role="alert" style={{ marginBottom: 12 }}>
                {pairError}
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <label className="sg-label" htmlFor="pair-device-name">
                  {labels.pairModal.nameLabel}
                </label>
                <input
                  id="pair-device-name"
                  name={labels.pairModal.nameLabel}
                  type="text"
                  value={pairName}
                  placeholder={labels.pairModal.namePlaceholder}
                  onChange={(event) => setPairName(event.currentTarget.value)}
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <label className="sg-label" htmlFor="pair-device-model">
                  {labels.pairModal.modelLabel}
                </label>
                <input
                  id="pair-device-model"
                  name={labels.pairModal.modelLabel}
                  type="text"
                  value={pairModel}
                  placeholder={labels.pairModal.modelPlaceholder}
                  onChange={(event) => setPairModel(event.currentTarget.value)}
                />
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button className="btn-ghost" type="button" onClick={closePairModal}>
              {labels.actions.cancel}
            </Button>
            <Button
              className="btn-primary"
              type="submit"
              disabled={isPairing || pairName.trim().length === 0 || pairModel.trim().length === 0}
            >
              {labels.pairModal.submit}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </main>
  );
}
