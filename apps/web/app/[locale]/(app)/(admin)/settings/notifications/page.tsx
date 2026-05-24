'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Switch } from '@monopilot/ui/Switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type NotificationChannel = 'email' | 'in-app' | 'SMS' | 'slack';

type ChannelSetting = {
  id: NotificationChannel;
  label: string;
  hint: string;
  enabled: boolean;
  verified?: boolean;
  usageText?: string;
};

type NotificationRule = {
  id: string;
  on: boolean;
  trigger: string;
  audience: string;
  channel: NotificationChannel[];
};

type DigestSetting = {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
};

type PageState = 'ready' | 'loading' | 'empty' | 'error';

type ToggleRuleInput = { ruleId: string; enabled: boolean };
type ToggleRuleResult = {
  ok: true;
  ruleId: string;
  enabled: boolean;
  outboxEventType: 'settings.notification_rule_updated';
};
type ToggleChannelInput = { channelId: NotificationChannel; enabled: boolean };
type ToggleChannelResult = {
  ok: true;
  channelId: NotificationChannel;
  enabled: boolean;
  outboxEventType: 'settings.notification_channel_updated';
};
type ToggleDigestInput = { digestId: string; enabled: boolean };
type ToggleDigestResult = {
  ok: true;
  digestId: string;
  enabled: boolean;
  outboxEventType: 'settings.notification_digest_updated';
};

type NotificationsPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  channels?: ChannelSetting[];
  notificationRules?: NotificationRule[];
  digestEmails?: DigestSetting[];
  toggleNotificationChannel?: (input: ToggleChannelInput) => Promise<ToggleChannelResult>;
  toggleNotificationRule?: (input: ToggleRuleInput) => Promise<ToggleRuleResult>;
  toggleDigestEmail?: (input: ToggleDigestInput) => Promise<ToggleDigestResult>;
};

type NotificationsLabels = {
  title: string;
  subtitle: string;
  channelsTitle: string;
  channelsSubtitle: string;
  verified: string;
  configureSlack: string;
  rulesTitle: string;
  rulesSubtitle: string;
  newRule: string;
  on: string;
  trigger: string;
  audience: string;
  channels: string;
  digestTitle: string;
  loading: string;
  empty: string;
  error: string;
};

const labels: NotificationsLabels = {
  title: 'Notifications',
  subtitle: 'When and how the system sends alerts.',
  channelsTitle: 'Channels',
  channelsSubtitle: 'Outbound channels the system can use.',
  verified: '✓ Verified',
  configureSlack: 'Configure →',
  rulesTitle: 'Notification rules',
  rulesSubtitle: 'Which events trigger which notifications.',
  newRule: '+ New rule',
  on: 'On',
  trigger: 'Trigger',
  audience: 'Audience',
  channels: 'Channels',
  digestTitle: 'Digest emails',
  loading: 'Loading notifications…',
  empty: 'No notification rules are configured yet.',
  error: 'Unable to load notification settings.',
};

// Explicit fallback provenance: project-shaped Settings notification rows matching the PRD/ops prototype shape.
// Runtime Server Component callers can pass live Drizzle rows through props without treating prototype mock values as truth.
const defaultChannels: ChannelSetting[] = [
  {
    id: 'email',
    label: 'Email',
    hint: 'Sent from no-reply@monopilot.app',
    enabled: true,
    verified: true,
  },
  {
    id: 'in-app',
    label: 'In-app banners',
    hint: 'Shown at the top of the UI.',
    enabled: true,
  },
  {
    id: 'SMS',
    label: 'SMS',
    hint: 'Via Twilio — only used for critical alerts.',
    enabled: true,
    usageText: '28 messages sent this month',
  },
  {
    id: 'slack',
    label: 'Slack',
    hint: 'Post alerts to a Slack channel.',
    enabled: false,
  },
];

const defaultRules: NotificationRule[] = [
  {
    id: 'rule-wo-late',
    on: true,
    trigger: 'WO late to start',
    audience: 'Managers',
    channel: ['email', 'in-app'],
  },
  {
    id: 'rule-hold-created',
    on: true,
    trigger: 'Quality hold created',
    audience: 'QA + Supervisors',
    channel: ['email', 'in-app', 'SMS'],
  },
  {
    id: 'rule-d365-failed',
    on: false,
    trigger: 'D365 sync failed',
    audience: 'Admins',
    channel: ['email'],
  },
];

const defaultDigests: DigestSetting[] = [
  {
    id: 'daily-plant-summary',
    label: 'Daily plant summary',
    hint: 'Sent to Managers at 18:00.',
    enabled: true,
  },
  {
    id: 'weekly-npd-digest',
    label: 'Weekly NPD digest',
    hint: 'Sent to NPD managers Monday 09:00.',
    enabled: true,
  },
  {
    id: 'monthly-compliance-report',
    label: 'Monthly compliance report',
    hint: 'Sent to Admins on the 1st of each month.',
    enabled: false,
  },
];

async function defaultToggleNotificationRule(input: ToggleRuleInput): Promise<ToggleRuleResult> {
  return {
    ok: true,
    ruleId: input.ruleId,
    enabled: input.enabled,
    outboxEventType: 'settings.notification_rule_updated',
  };
}

async function defaultToggleNotificationChannel(input: ToggleChannelInput): Promise<ToggleChannelResult> {
  return {
    ok: true,
    channelId: input.channelId,
    enabled: input.enabled,
    outboxEventType: 'settings.notification_channel_updated',
  };
}

async function defaultToggleDigestEmail(input: ToggleDigestInput): Promise<ToggleDigestResult> {
  return {
    ok: true,
    digestId: input.digestId,
    enabled: input.enabled,
    outboxEventType: 'settings.notification_digest_updated',
  };
}

const channelBadgeTone: Partial<Record<NotificationChannel, 'info' | 'secondary' | 'warning' | 'muted'>> = {
  email: 'info',
  'in-app': 'secondary',
  SMS: 'warning',
  slack: 'muted',
};

export default function SettingsNotificationsPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as NotificationsPageProps;

  return (
    <SettingsNotificationsScreen
      state={props.state ?? 'ready'}
      channels={props.channels ?? defaultChannels}
      notificationRules={props.notificationRules ?? defaultRules}
      digestEmails={props.digestEmails ?? defaultDigests}
      toggleNotificationChannel={props.toggleNotificationChannel ?? defaultToggleNotificationChannel}
      toggleNotificationRule={props.toggleNotificationRule ?? defaultToggleNotificationRule}
      toggleDigestEmail={props.toggleDigestEmail ?? defaultToggleDigestEmail}
    />
  );
}

function SettingsNotificationsScreen({
  state,
  channels,
  notificationRules,
  digestEmails,
  toggleNotificationChannel,
  toggleNotificationRule,
  toggleDigestEmail,
}: {
  state: PageState;
  channels: ChannelSetting[];
  notificationRules: NotificationRule[];
  digestEmails: DigestSetting[];
  toggleNotificationChannel: (input: ToggleChannelInput) => Promise<ToggleChannelResult>;
  toggleNotificationRule: (input: ToggleRuleInput) => Promise<ToggleRuleResult>;
  toggleDigestEmail: (input: ToggleDigestInput) => Promise<ToggleDigestResult>;
}) {
  const router = useRouter();
  const [channelEnabled, setChannelEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(channels.map((channel) => [channel.id, channel.enabled])),
  );
  const [ruleEnabled, setRuleEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(notificationRules.map((rule) => [rule.id, rule.on])),
  );
  const [digestEnabled, setDigestEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(digestEmails.map((digest) => [digest.id, digest.enabled])),
  );
  const [pendingChannelId, setPendingChannelId] = React.useState<string | null>(null);
  const [pendingRuleId, setPendingRuleId] = React.useState<string | null>(null);
  const [pendingDigestId, setPendingDigestId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setChannelEnabled(Object.fromEntries(channels.map((channel) => [channel.id, channel.enabled])));
  }, [channels]);

  React.useEffect(() => {
    setRuleEnabled(Object.fromEntries(notificationRules.map((rule) => [rule.id, rule.on])));
  }, [notificationRules]);

  React.useEffect(() => {
    setDigestEnabled(Object.fromEntries(digestEmails.map((digest) => [digest.id, digest.enabled])));
  }, [digestEmails]);

  const toggleChannel = async (channel: ChannelSetting, enabled: boolean) => {
    setPendingChannelId(channel.id);
    setChannelEnabled((current) => ({ ...current, [channel.id]: enabled }));
    try {
      await toggleNotificationChannel({ channelId: channel.id, enabled });
    } catch {
      setChannelEnabled((current) => ({ ...current, [channel.id]: !enabled }));
    } finally {
      setPendingChannelId(null);
    }
  };

  const toggleRule = async (rule: NotificationRule, enabled: boolean) => {
    setPendingRuleId(rule.id);
    setRuleEnabled((current) => ({ ...current, [rule.id]: enabled }));
    try {
      await toggleNotificationRule({ ruleId: rule.id, enabled });
    } catch {
      setRuleEnabled((current) => ({ ...current, [rule.id]: !enabled }));
    } finally {
      setPendingRuleId(null);
    }
  };

  const toggleDigest = async (digest: DigestSetting, enabled: boolean) => {
    setPendingDigestId(digest.id);
    setDigestEnabled((current) => ({ ...current, [digest.id]: enabled }));
    try {
      await toggleDigestEmail({ digestId: digest.id, enabled });
    } catch {
      setDigestEnabled((current) => ({ ...current, [digest.id]: !enabled }));
    } finally {
      setPendingDigestId(null);
    }
  };

  if (state === 'loading') {
    return (
      <main
        data-testid="settings-notifications-screen"
        data-screen="notifications_screen"
        data-route="/settings/notifications"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:98-163"
        className="mx-auto max-w-5xl space-y-6 p-6"
        aria-busy="true"
      >
        <PageHead />
        <section
          data-testid="settings-notifications-loading"
          className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm"
        >
          {labels.loading}
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main
        data-testid="settings-notifications-screen"
        data-screen="notifications_screen"
        data-route="/settings/notifications"
        data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:98-163"
        className="mx-auto max-w-5xl space-y-6 p-6"
      >
        <PageHead />
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {labels.error}
        </div>
      </main>
    );
  }

  const rulesAreEmpty = state === 'empty' || notificationRules.length === 0;

  return (
    <main
      data-testid="settings-notifications-screen"
      data-screen="notifications_screen"
      data-route="/settings/notifications"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:98-163"
      aria-labelledby="settings-notifications-title"
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <PageHead />

      <Section region="channels-section" title={labels.channelsTitle} sub={labels.channelsSubtitle}>
        {channels.map((channel) => (
          <SettingRow key={channel.id} testId="settings-notification-channel-row" label={channel.label} hint={channel.hint}>
            <div className="flex items-center gap-2">
              <Switch
                aria-label={channel.label}
                checked={Boolean(channelEnabled[channel.id])}
                disabled={pendingChannelId === channel.id}
                onCheckedChange={(enabled) => void toggleChannel(channel, enabled)}
              />
              {channel.verified ? <Badge variant="success">{labels.verified}</Badge> : null}
              {channel.usageText ? <span className="text-xs text-slate-500">{channel.usageText}</span> : null}
              {channel.id === 'slack' ? (
                <a
                  href="/settings/integrations?highlight=slack"
                  className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    router.push('/settings/integrations?highlight=slack');
                  }}
                >
                  {labels.configureSlack}
                </a>
              ) : null}
            </div>
          </SettingRow>
        ))}
      </Section>

      <Section
        region="notification-rules-section"
        title={labels.rulesTitle}
        sub={labels.rulesSubtitle}
        action={
          <Button type="button" className="btn-primary btn-sm" onClick={() => router.push('/settings/rules?new=notification')}>
            {labels.newRule}
          </Button>
        }
      >
        {rulesAreEmpty ? (
          <p role="status" className="px-5 py-4 text-sm text-slate-500">
            {labels.empty}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.on}</TableHead>
                <TableHead>{labels.trigger}</TableHead>
                <TableHead>{labels.audience}</TableHead>
                <TableHead>{labels.channels}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {notificationRules.map((rule) => (
                <TableRow key={rule.id} data-testid="settings-notification-rule-row">
                  <TableCell className="w-10">
                    <Switch
                      aria-label={rule.trigger}
                      checked={Boolean(ruleEnabled[rule.id])}
                      disabled={pendingRuleId === rule.id}
                      onCheckedChange={(enabled) => void toggleRule(rule, enabled)}
                    />
                  </TableCell>
                  <TableCell className="font-medium" data-testid="settings-notification-rule-trigger">
                    {rule.trigger}
                  </TableCell>
                  <TableCell className="text-slate-500">{rule.audience}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.channel.map((channel) => (
                        <Badge key={channel} variant={channelBadgeTone[channel] ?? 'muted'}>
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-slate-400">⋮</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section region="digest-emails-section" title={labels.digestTitle}>
        {digestEmails.map((digest) => (
          <SettingRow key={digest.id} testId="settings-notification-digest-row" label={digest.label} hint={digest.hint}>
            <Switch
              aria-label={digest.label}
              checked={Boolean(digestEnabled[digest.id])}
              disabled={pendingDigestId === digest.id}
              onCheckedChange={(enabled) => void toggleDigest(digest, enabled)}
            />
          </SettingRow>
        ))}
      </Section>
    </main>
  );
}

function PageHead() {
  return (
    <header data-region="page-head" className="space-y-1" aria-labelledby="settings-notifications-title">
      <h1 id="settings-notifications-title" className="text-2xl font-semibold tracking-tight text-slate-950">
        {labels.title}
      </h1>
      <p className="text-sm text-slate-600">{labels.subtitle}</p>
    </header>
  );
}

function Section({
  region,
  title,
  sub,
  action,
  children,
}: {
  region: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid="settings-notifications-section"
      data-region={region}
      role="region"
      aria-label={title}
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function SettingRow({
  testId,
  label,
  hint,
  children,
}: {
  testId: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-4 px-5 py-3 first:pt-4 last:pb-4">
      <div className="min-w-0">
        <p data-testid="settings-notification-row-label" className="text-sm font-medium text-slate-900">
          {label}
        </p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
