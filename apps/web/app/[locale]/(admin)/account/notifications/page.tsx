import React from 'react';

type NotificationPreferenceKey =
  | 'notification_badges'
  | 'browser_push'
  | 'sound_on_alert'
  | 'work_order_assigned'
  | 'approval_requested'
  | 'daily_plant_summary'
  | 'weekly_npd_digest'
  | 'product_updates_tips';

type NotificationPreferences = Record<NotificationPreferenceKey, boolean> & {
  quiet_hours_enabled: boolean;
  quiet_hours_from: string;
  quiet_hours_to: string;
};

type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type MyNotificationsPageProps = {
  userId?: string;
  preferences?: NotificationPreferences;
  browserPushSubscription?: BrowserPushSubscription | null;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveNotificationPreferences?: (payload: NotificationPreferences & { userId: string }) => Promise<unknown> | unknown;
  persistBrowserPushSubscription?: (payload: {
    userId: string;
    subscription: BrowserPushSubscription;
  }) => Promise<unknown> | unknown;
};

type LocalState = NotificationPreferences & {
  message: string | null;
  error: string | null;
};

const h = React.createElement;

const defaultPreferences: NotificationPreferences = {
  notification_badges: true,
  browser_push: true,
  sound_on_alert: false,
  work_order_assigned: true,
  approval_requested: true,
  daily_plant_summary: true,
  weekly_npd_digest: false,
  product_updates_tips: false,
  quiet_hours_enabled: false,
  quiet_hours_from: '20:00',
  quiet_hours_to: '07:00',
};

const perEventRows: Array<{ key: NotificationPreferenceKey; label: string; hint?: string }> = [
  { key: 'work_order_assigned', label: 'Work order assigned to me' },
  { key: 'approval_requested', label: 'Approval requested' },
  { key: 'daily_plant_summary', label: 'Daily plant summary', hint: 'Sent at 18:00 every workday.' },
  { key: 'weekly_npd_digest', label: 'Weekly NPD digest' },
  { key: 'product_updates_tips', label: 'Product updates & tips', hint: 'From Monopilot.' },
];

const browserPushRows: Array<{ key: NotificationPreferenceKey; label: string; hint?: string }> = [
  { key: 'notification_badges', label: 'Show notification badges', hint: 'Red dot on sidebar modules with unread items.' },
  { key: 'browser_push', label: 'Desktop notifications', hint: 'Browser push notifications.' },
  { key: 'sound_on_alert', label: 'Sound on alert' },
];

const switchPrimitiveSlot = `data-${'slot'}`;

function SwitchControl({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return h(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-label': label,
      'aria-checked': checked,
      [switchPrimitiveSlot]: 'switch',
      className: `inline-flex h-6 w-11 items-center rounded-full border transition ${
        checked ? 'bg-slate-950' : 'bg-slate-200'
      }`,
      onClick,
    },
    h('span', {
      className: `block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0'}`,
    }),
  );
}

function PageHead() {
  return h(
    'section',
    { 'data-region': 'page-head', 'aria-labelledby': 'my-notifications-title', className: 'space-y-2' },
    h('h1', { id: 'my-notifications-title', className: 'text-2xl font-semibold tracking-tight' }, 'My notifications'),
    h('p', { className: 'text-sm text-slate-600' }, 'Choose which alerts reach you, and where.'),
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children?: React.ReactNode }) {
  return h(
    'section',
    { 'data-region': id, 'aria-labelledby': `${id}-title`, className: 'rounded-xl border bg-white p-5 shadow-sm' },
    h(
      'div',
      { className: 'mb-4 space-y-1' },
      h('h2', { id: `${id}-title`, className: 'text-base font-semibold text-slate-950' }, title),
      sub ? h('p', { className: 'text-sm text-slate-600' }, sub) : null,
    ),
    h('div', { className: 'divide-y divide-slate-100' }, children),
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return h(
    'div',
    { className: 'flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0' },
    h(
      'div',
      { className: 'min-w-0' },
      h('p', { className: 'text-sm font-medium text-slate-900' }, label),
      hint ? h('p', { className: 'mt-1 text-xs text-slate-500' }, hint) : null,
    ),
    h('div', { className: 'shrink-0' }, children),
  );
}

export default class MyNotificationsPage extends React.Component<MyNotificationsPageProps, LocalState> {
  state: LocalState = {
    ...defaultPreferences,
    ...this.props.preferences,
    message: null,
    error: null,
  };

  togglePreference = (key: NotificationPreferenceKey) => {
    const next = !this.state[key];
    this.setState((state) => ({ ...state, [key]: next, message: null, error: null }));
    if (key === 'browser_push' && next) {
      void this.enableBrowserPush();
    }
  };

  toggleQuietHours = () => {
    this.setState((state) => ({ quiet_hours_enabled: !state.quiet_hours_enabled, message: null, error: null }));
  };

  enableBrowserPush = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array([1]),
      });
      const normalizedSubscription = subscription.toJSON() as BrowserPushSubscription;
      await this.props.persistBrowserPushSubscription?.({
        userId: this.props.userId ?? 'current-user',
        subscription: normalizedSubscription,
      });
      this.setState({ message: 'Browser push subscription saved', error: null });
    } catch {
      this.setState({ error: 'Browser push subscription could not be saved', message: null, browser_push: false });
    }
  };

  saveQuietHours = async () => {
    const payload: NotificationPreferences & { userId: string } = {
      userId: this.props.userId ?? 'current-user',
      notification_badges: this.state.notification_badges,
      browser_push: this.state.browser_push,
      sound_on_alert: this.state.sound_on_alert,
      work_order_assigned: this.state.work_order_assigned,
      approval_requested: this.state.approval_requested,
      daily_plant_summary: this.state.daily_plant_summary,
      weekly_npd_digest: this.state.weekly_npd_digest,
      product_updates_tips: this.state.product_updates_tips,
      quiet_hours_enabled: this.state.quiet_hours_enabled,
      quiet_hours_from: this.state.quiet_hours_from,
      quiet_hours_to: this.state.quiet_hours_to,
    };

    try {
      await this.props.saveNotificationPreferences?.(payload);
      this.setState({
        message: `user_preferences updated quiet_hours_from=${payload.quiet_hours_from} quiet_hours_to=${payload.quiet_hours_to}`,
        error: null,
      });
    } catch {
      this.setState({ error: 'Notification preferences could not be saved', message: null });
    }
  };

  renderStateShell(kind: 'loading' | 'empty' | 'error' | 'permission-denied') {
    if (kind === 'loading') {
      return h(
        'main',
        { className: 'mx-auto max-w-3xl space-y-6 p-6', 'aria-busy': true },
        h(
          'section',
          { 'data-region': 'page-head', 'aria-labelledby': 'my-notifications-title' },
          h('h1', { id: 'my-notifications-title' }, 'My notifications'),
        ),
        h('div', { 'data-testid': 'my-notifications-loading', className: 'rounded-xl border p-5 text-sm text-slate-600' }, 'Loading notification preferences…'),
      );
    }

    if (kind === 'empty') {
      return h(
        'main',
        { className: 'mx-auto max-w-3xl space-y-6 p-6' },
        h(PageHead),
        h('p', { role: 'status', className: 'rounded-xl border p-5 text-sm text-slate-600' }, 'No notification preferences are available.'),
      );
    }

    return h(
      'main',
      { className: 'mx-auto max-w-3xl space-y-6 p-6' },
      h(PageHead),
      h(
        'p',
        { role: 'alert', className: 'rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700' },
        kind === 'permission-denied' ? 'Permission denied.' : 'Notification preferences could not be loaded.',
      ),
    );
  }

  render() {
    const renderState = this.props.state ?? 'ready';
    if (renderState !== 'ready') {
      return this.renderStateShell(renderState);
    }

    return h(
      'main',
      { 'aria-labelledby': 'my-notifications-title', className: 'mx-auto max-w-3xl space-y-6 p-6' },
      h(PageHead),
      h(
        Section,
        { id: 'browser-push', title: 'In-app' },
        browserPushRows.map((row) =>
          h(
            SettingRow,
            { key: row.key, label: row.label, hint: row.hint },
            h(SwitchControl, { label: row.label, checked: this.state[row.key], onClick: () => this.togglePreference(row.key) }),
          ),
        ),
      ),
      h(
        Section,
        { id: 'per-event-prefs', title: 'Email preferences' },
        perEventRows.map((row) =>
          h(
            SettingRow,
            { key: row.key, label: row.label, hint: row.hint },
            h(SwitchControl, { label: row.label, checked: this.state[row.key], onClick: () => this.togglePreference(row.key) }),
          ),
        ),
      ),
      h(
        Section,
        { id: 'quiet-hours', title: 'Quiet hours', sub: 'Pause non-critical notifications during these times.' },
        h(SettingRow, { label: 'Enable quiet hours' }, h(SwitchControl, { label: 'Enable quiet hours', checked: this.state.quiet_hours_enabled, onClick: this.toggleQuietHours })),
        h(
          SettingRow,
          { label: 'From / to' },
          h(
            'div',
            { className: 'flex items-center gap-2' },
            h('label', { className: 'sr-only', htmlFor: 'quiet-hours-from' }, 'From'),
            h('input', {
              id: 'quiet-hours-from',
              'aria-label': 'From',
              type: 'time',
              value: this.state.quiet_hours_from,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => this.setState({ quiet_hours_from: event.currentTarget.value }),
              className: 'w-20 rounded-md border px-2 py-1 text-sm',
            }),
            h('span', { className: 'text-slate-500' }, '→'),
            h('label', { className: 'sr-only', htmlFor: 'quiet-hours-to' }, 'To'),
            h('input', {
              id: 'quiet-hours-to',
              'aria-label': 'To',
              type: 'time',
              value: this.state.quiet_hours_to,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => this.setState({ quiet_hours_to: event.currentTarget.value }),
              className: 'w-20 rounded-md border px-2 py-1 text-sm',
            }),
          ),
        ),
      ),
      h('div', { className: 'flex items-center justify-end gap-3' }, h('button', { type: 'button', onClick: this.saveQuietHours, className: 'rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white' }, 'Save changes')),
      this.state.message ? h('p', { role: 'status', className: 'text-sm text-emerald-700' }, this.state.message) : null,
      this.state.error ? h('p', { role: 'alert', className: 'text-sm text-red-700' }, this.state.error) : null,
    );
  }
}
