'use client';

import React from 'react';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

type NotificationPreferences = {
  inAppBadges: boolean;
  desktopNotifications: boolean;
  soundOnAlert: boolean;
  emailWorkOrderAssigned: boolean;
  emailApprovalRequested: boolean;
  emailDailyPlantSummary: boolean;
  emailWeeklyNpdDigest: boolean;
  emailProductUpdates: boolean;
  quietHoursEnabled: boolean;
  quiet_hours_from: string;
  quiet_hours_to: string;
  pushSubscription: null | { endpoint: string; keys: { p256dh: string; auth: string } };
};

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';

type NotificationsPageProps = {
  preferences?: NotificationPreferences;
  canEdit?: boolean;
  state?: PageState;
  savePreferences?: (input: Partial<NotificationPreferences>) => Promise<unknown>;
  savePushSubscription?: (subscription: PushSubscriptionJSON) => Promise<unknown>;
};

const defaultPreferences: NotificationPreferences = {
  inAppBadges: true,
  desktopNotifications: false,
  soundOnAlert: false,
  emailWorkOrderAssigned: true,
  emailApprovalRequested: true,
  emailDailyPlantSummary: true,
  emailWeeklyNpdDigest: false,
  emailProductUpdates: false,
  quietHoursEnabled: false,
  quiet_hours_from: '20:00',
  quiet_hours_to: '07:00',
  pushSubscription: null,
};

function noopAsync() {
  return Promise.resolve({ ok: true });
}

function LoadingState() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6" data-testid="notification-preferences-loading">
      <div data-slot="card" className="rounded-lg border p-4">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </main>
  );
}

function StatusState({ type }: { type: Exclude<PageState, 'ready' | 'loading'> }) {
  if (type === 'empty') {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div role="status" data-slot="card" className="rounded-lg border p-6">
          No notification preferences have been configured yet.
        </div>
      </main>
    );
  }

  const message =
    type === 'permission-denied'
      ? 'Permission denied: settings.notifications.manage is required to edit notification preferences.'
      : 'Notification preferences could not be loaded.';

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div role="alert" data-slot="card" className="rounded-lg border border-destructive p-6 text-destructive">
        {message}
      </div>
    </main>
  );
}

function SwitchControl({
  label,
  checked,
  disabled = false,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      className="inline-flex h-6 w-11 items-center rounded-full border bg-muted px-0.5 transition data-[state=checked]:bg-primary"
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={onToggle}
    >
      <span
        aria-hidden="true"
        className="block h-5 w-5 rounded-full bg-background shadow transition-transform"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function PreferenceRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section role="region" aria-label={title} data-slot="card" className="rounded-lg border bg-card text-card-foreground">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="divide-y px-5">{children}</div>
    </section>
  );
}

function toPushSubscriptionJSON(subscription: PushSubscription): PushSubscriptionJSON {
  if (typeof subscription.toJSON === 'function') {
    return subscription.toJSON();
  }

  return { endpoint: subscription.endpoint };
}

async function subscribeToPush(savePushSubscription: (subscription: PushSubscriptionJSON) => Promise<unknown>) {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true });
  await savePushSubscription(toPushSubscriptionJSON(subscription));
}

export default function NotificationsPage({
  preferences = defaultPreferences,
  canEdit = true,
  state = 'ready',
  savePreferences = noopAsync,
  savePushSubscription = noopAsync,
}: NotificationsPageProps) {
  const [draft, setDraft] = React.useState<NotificationPreferences>(preferences);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setDraft(preferences);
    setDirty(false);
  }, [preferences]);

  if (state === 'loading') {
    return <LoadingState />;
  }

  if (state === 'empty' || state === 'error' || state === 'permission-denied' || !canEdit) {
    return <StatusState type={state === 'ready' ? 'permission-denied' : state} />;
  }

  const update = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const toggle = (key: keyof NotificationPreferences) => {
    const nextValue = !draft[key];
    update(key, nextValue as never);
  };

  const toggleDesktopNotifications = async () => {
    const nextValue = !draft.desktopNotifications;
    update('desktopNotifications', nextValue);
    if (nextValue) {
      await subscribeToPush(savePushSubscription);
    }
  };

  const reset = () => {
    setDraft(preferences);
    setDirty(false);
  };

  const submit = async () => {
    await savePreferences({
      ...draft,
      quiet_hours_from: draft.quiet_hours_from,
      quiet_hours_to: draft.quiet_hours_to,
    });
    setDirty(false);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My notifications</h1>
        <p className="text-sm text-muted-foreground">Choose which alerts reach you, and where.</p>
      </header>

      <Section title="In-app">
        <PreferenceRow label="Show notification badges" hint="Red dot on sidebar modules with unread items.">
          <SwitchControl
            label="Show notification badges"
            checked={draft.inAppBadges}
            onToggle={() => toggle('inAppBadges')}
          />
        </PreferenceRow>
        <PreferenceRow label="Desktop notifications" hint="Browser push notifications.">
          <SwitchControl
            label="Desktop notifications"
            checked={draft.desktopNotifications}
            onToggle={toggleDesktopNotifications}
          />
        </PreferenceRow>
        <PreferenceRow label="Sound on alert">
          <SwitchControl label="Sound on alert" checked={draft.soundOnAlert} onToggle={() => toggle('soundOnAlert')} />
        </PreferenceRow>
      </Section>

      <Section title="Email preferences">
        <PreferenceRow label="Work order assigned to me">
          <SwitchControl
            label="Work order assigned to me"
            checked={draft.emailWorkOrderAssigned}
            onToggle={() => toggle('emailWorkOrderAssigned')}
          />
        </PreferenceRow>
        <PreferenceRow label="Approval requested">
          <SwitchControl
            label="Approval requested"
            checked={draft.emailApprovalRequested}
            onToggle={() => toggle('emailApprovalRequested')}
          />
        </PreferenceRow>
        <PreferenceRow label="Daily plant summary" hint="Sent at 18:00 every workday.">
          <SwitchControl
            label="Daily plant summary"
            checked={draft.emailDailyPlantSummary}
            onToggle={() => toggle('emailDailyPlantSummary')}
          />
        </PreferenceRow>
        <PreferenceRow label="Weekly NPD digest">
          <SwitchControl
            label="Weekly NPD digest"
            checked={draft.emailWeeklyNpdDigest}
            onToggle={() => toggle('emailWeeklyNpdDigest')}
          />
        </PreferenceRow>
        <PreferenceRow label="Product updates & tips" hint="From Monopilot.">
          <SwitchControl
            label="Product updates & tips"
            checked={draft.emailProductUpdates}
            onToggle={() => toggle('emailProductUpdates')}
          />
        </PreferenceRow>
      </Section>

      <Section title="Quiet hours" subtitle="Pause non-critical notifications during these times.">
        <PreferenceRow label="Enable quiet hours">
          <SwitchControl
            label="Enable quiet hours"
            checked={draft.quietHoursEnabled}
            onToggle={() => toggle('quietHoursEnabled')}
          />
        </PreferenceRow>
        <PreferenceRow label="From / to">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="quiet-hours-from">
              From
            </label>
            <Input
              id="quiet-hours-from"
              aria-label="From"
              type="text"
              value={draft.quiet_hours_from}
              onChange={(event) => update('quiet_hours_from', event.currentTarget.value)}
              className="w-20"
            />
            <span className="text-muted-foreground">→</span>
            <label className="sr-only" htmlFor="quiet-hours-to">
              To
            </label>
            <Input
              id="quiet-hours-to"
              aria-label="To"
              type="text"
              value={draft.quiet_hours_to}
              onChange={(event) => update('quiet_hours_to', event.currentTarget.value)}
              className="w-20"
            />
          </div>
        </PreferenceRow>
      </Section>

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={reset}>
          Cancel
        </Button>
        <Button type="button" disabled={!dirty} onClick={submit}>
          Save changes
        </Button>
      </div>
    </main>
  );
}
