'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Switch } from '@monopilot/ui/Switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type NotificationChannel = 'email' | 'in-app' | 'SMS' | 'slack';

export type ChannelSetting = {
  id: NotificationChannel;
  label: string;
  hint: string;
  enabled: boolean;
  verified?: boolean;
  usageText?: string;
};

export type NotificationRule = {
  id: string;
  on: boolean;
  trigger: string;
  audience: string;
  channel: NotificationChannel[];
};

export type DigestSetting = {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
};

export type PageState = 'ready' | 'loading' | 'empty' | 'error';

export type ToggleRuleInput = { ruleId: string; enabled: boolean };
export type ToggleRuleResult = {
  ok: true;
  ruleId: string;
  enabled: boolean;
  outboxEventType: 'settings.notification_rule_updated';
};
export type ToggleChannelInput = { channelId: NotificationChannel; enabled: boolean };
export type ToggleChannelResult = {
  ok: true;
  channelId: NotificationChannel;
  enabled: boolean;
  outboxEventType: 'settings.notification_channel_updated';
};
export type ToggleDigestInput = { digestId: string; enabled: boolean };
export type ToggleDigestResult = {
  ok: true;
  digestId: string;
  enabled: boolean;
  outboxEventType: 'settings.notification_digest_updated';
};

export type NotificationsLabels = {
  title: string;
  subtitle: string;
  channelsTitle: string;
  channelsSubtitle: string;
  email: string;
  emailHint: string;
  verified: string;
  inAppBanners: string;
  inAppHint: string;
  sms: string;
  smsHint: string;
  slack: string;
  slackHint: string;
  configureSlack: string;
  rulesTitle: string;
  rulesSubtitle: string;
  newRule: string;
  on: string;
  trigger: string;
  audience: string;
  channels: string;
  digestTitle: string;
  dailyPlantSummary: string;
  dailyPlantSummaryHint: string;
  weeklyNpdDigest: string;
  weeklyNpdDigestHint: string;
  monthlyComplianceReport: string;
  monthlyComplianceReportHint: string;
  loading: string;
  empty: string;
  error: string;
};

type SettingsNotificationsScreenProps = {
  labels: NotificationsLabels;
  state: PageState;
  channels: ChannelSetting[];
  notificationRules: NotificationRule[];
  digestEmails: DigestSetting[];
  toggleNotificationChannel: (input: ToggleChannelInput) => Promise<ToggleChannelResult>;
  toggleNotificationRule: (input: ToggleRuleInput) => Promise<ToggleRuleResult>;
  toggleDigestEmail: (input: ToggleDigestInput) => Promise<ToggleDigestResult>;
};

const channelBadgeTone: Partial<Record<NotificationChannel, 'info' | 'secondary' | 'warning' | 'muted'>> = {
  email: 'info',
  'in-app': 'secondary',
  SMS: 'warning',
  slack: 'muted',
};

export default function SettingsNotificationsScreen({
  labels,
  state,
  channels,
  notificationRules,
  digestEmails,
  toggleNotificationChannel,
  toggleNotificationRule,
  toggleDigestEmail,
}: SettingsNotificationsScreenProps) {
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
        <PageHead labels={labels} />
        <section
          data-testid="settings-notifications-loading"
          role="status"
          className="card helper"
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
        <PageHead labels={labels} />
        <div role="alert" className="alert alert-red">
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
      <PageHead labels={labels} />

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
              {channel.usageText ? <span className="muted text-xs">{channel.usageText}</span> : null}
              {channel.id === 'slack' ? (
                <a
                  href="/settings/integrations?highlight=slack"
                  className="text-xs font-medium text-[var(--blue)] underline-offset-2 hover:underline"
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
          <div role="status" className="empty-state">
            <div aria-hidden="true" className="empty-state-icon">🔔</div>
            <p className="empty-state-body">{labels.empty}</p>
          </div>
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
                  <TableCell className="muted">{rule.audience}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.channel.map((channel) => (
                        <Badge key={channel} variant={channelBadgeTone[channel] ?? 'muted'}>
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="muted text-right">⋮</TableCell>
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

function PageHead({ labels }: { labels: NotificationsLabels }) {
  return (
    <header data-region="page-head" className="sg-head space-y-1" aria-labelledby="settings-notifications-title">
      <h1 id="settings-notifications-title" className="page-title">
        {labels.title}
      </h1>
      <p className="helper">{labels.subtitle}</p>
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
      className="card !p-0"
    >
      <div className="card-head flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="card-title">{title}</h2>
          {sub ? <p className="helper mt-1">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="divide-y divide-[var(--border)]">{children}</div>
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
        <p data-testid="settings-notification-row-label" className="label">
          {label}
        </p>
        <p className="helper mt-1">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
