'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';

import { PageHead, Section, SRow, Toggle } from '../../settings/_components';

import type { NotificationPreferenceKey, NotificationPreferences } from './notifications-data';

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/account-screens.jsx:77-124';

type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type MyNotificationsPageProps = {
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

export default class MyNotificationsPage extends React.Component<MyNotificationsPageProps, LocalState> {
  state: LocalState = {
    ...defaultPreferences,
    ...this.props.preferences,
    message: null,
    error: null,
  };

  // The real signed-in user id is always supplied by the Server Component.
  // There is NO 'current-user' literal fallback — a missing id is a wiring bug
  // and we surface it instead of silently writing under a fake principal.
  private requireUserId(): string {
    const userId = this.props.userId;
    if (!userId) {
      throw new Error('MyNotificationsPage: missing signed-in userId from Server Component');
    }
    return userId;
  }

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
        userId: this.requireUserId(),
        subscription: normalizedSubscription,
      });
      this.setState({ message: 'Browser push subscription saved', error: null });
    } catch {
      this.setState({ error: 'Browser push subscription could not be saved', message: null, browser_push: false });
    }
  };

  saveQuietHours = async () => {
    const payload: NotificationPreferences & { userId: string } = {
      userId: this.requireUserId(),
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
      return (
        <main
          aria-busy
          className="mx-auto grid max-w-3xl gap-3 p-6"
          data-prototype-source={PROTOTYPE_SOURCE}
        >
          <PageHead title="My notifications" sub="Choose which alerts reach you, and where." />
          <div className="sg-section" data-testid="my-notifications-loading" role="status">
            <div className="sg-section-body">
              <span className="muted">Loading notification preferences…</span>
            </div>
          </div>
        </main>
      );
    }

    if (kind === 'empty') {
      return (
        <main className="mx-auto grid max-w-3xl gap-3 p-6" data-prototype-source={PROTOTYPE_SOURCE}>
          <PageHead title="My notifications" sub="Choose which alerts reach you, and where." />
          <div className="alert" role="status">
            No notification preferences are available.
          </div>
        </main>
      );
    }

    return (
      <main className="mx-auto grid max-w-3xl gap-3 p-6" data-prototype-source={PROTOTYPE_SOURCE}>
        <PageHead title="My notifications" sub="Choose which alerts reach you, and where." />
        <div className="alert alert-red" role="alert">
          {kind === 'permission-denied' ? 'Permission denied.' : 'Notification preferences could not be loaded.'}
        </div>
      </main>
    );
  }

  render() {
    const renderState = this.props.state ?? 'ready';
    if (renderState !== 'ready') {
      return this.renderStateShell(renderState);
    }

    return (
      <main
        aria-label="My notifications"
        className="mx-auto grid max-w-3xl gap-3 p-6"
        data-prototype-source={PROTOTYPE_SOURCE}
      >
        <PageHead title="My notifications" sub="Choose which alerts reach you, and where." />

        <Section title="In-app">
          {browserPushRows.map((row) => (
            <SRow key={row.key} label={row.label} hint={row.hint}>
              <Toggle
                aria-label={row.label}
                checked={this.state[row.key]}
                onChange={() => this.togglePreference(row.key)}
              />
            </SRow>
          ))}
        </Section>

        <Section title="Email preferences">
          {perEventRows.map((row) => (
            <SRow key={row.key} label={row.label} hint={row.hint}>
              <Toggle
                aria-label={row.label}
                checked={this.state[row.key]}
                onChange={() => this.togglePreference(row.key)}
              />
            </SRow>
          ))}
        </Section>

        <Section
          title="Quiet hours"
          sub="Pause non-critical notifications during these times."
          foot={
            <Button className="btn-primary" type="button" onClick={() => void this.saveQuietHours()}>
              Save changes
            </Button>
          }
        >
          <SRow label="Enable quiet hours">
            <Toggle
              aria-label="Enable quiet hours"
              checked={this.state.quiet_hours_enabled}
              onChange={this.toggleQuietHours}
            />
          </SRow>
          <SRow
            label="From / to"
            hint="Custom quiet-hours times are not yet stored — only the on/off toggle above is saved."
          >
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="quiet-hours-from">
                From
              </label>
              <input
                aria-label="From"
                id="quiet-hours-from"
                style={{ width: 90 }}
                type="time"
                disabled
                value={this.state.quiet_hours_from}
                readOnly
              />
              <span className="muted">→</span>
              <label className="sr-only" htmlFor="quiet-hours-to">
                To
              </label>
              <input
                aria-label="To"
                id="quiet-hours-to"
                style={{ width: 90 }}
                type="time"
                disabled
                value={this.state.quiet_hours_to}
                readOnly
              />
            </div>
          </SRow>
        </Section>

        {this.state.message ? (
          <div className="alert alert-green" role="status">
            {this.state.message}
          </div>
        ) : null}
        {this.state.error ? (
          <div className="alert alert-red" role="alert">
            {this.state.error}
          </div>
        ) : null}
      </main>
    );
  }
}
