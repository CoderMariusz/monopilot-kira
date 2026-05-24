import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import SettingsNotificationsScreen, {
  type ChannelSetting,
  type DigestSetting,
  type NotificationChannel,
  type NotificationRule,
  type NotificationsLabels,
  type PageState,
  type ToggleChannelInput,
  type ToggleChannelResult,
  type ToggleDigestInput,
  type ToggleDigestResult,
  type ToggleRuleInput,
  type ToggleRuleResult,
} from './notifications-screen.client';

export const dynamic = 'force-dynamic';

type NotificationsPageProps = {
  params?: Promise<{ locale: string }> | { locale: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
  // Test seam only: production calls load data in this Server Component. These typed overrides keep RTL parity tests
  // focused without reintroducing the prior unsafe unknown prop bag.
  state?: PageState;
  channels?: ChannelSetting[];
  notificationRules?: NotificationRule[];
  digestEmails?: DigestSetting[];
  toggleNotificationChannel?: (input: ToggleChannelInput) => Promise<ToggleChannelResult>;
  toggleNotificationRule?: (input: ToggleRuleInput) => Promise<ToggleRuleResult>;
  toggleDigestEmail?: (input: ToggleDigestInput) => Promise<ToggleDigestResult>;
};

type Translator = (key: string, values?: Record<string, string | number>) => string;
type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type NotificationPreferenceRow = {
  category: string;
  event: string;
  channel_email: boolean | null;
  channel_in_app: boolean | null;
};

type ServerNotificationsLabels = NotificationsLabels & {
  smsUsage: (count: number) => string;
};

type NotificationsReadResult = {
  channels: ChannelSetting[];
  notificationRules: NotificationRule[];
  digestEmails: DigestSetting[];
  smsMessagesThisMonth: number;
  state: PageState;
};

const OUTBOX_APP_VERSION = 'settings-notifications-screen';
const OUTBOX_NOTIFICATION_RULE_EVENT = 'settings.notification_rule_updated';
const OUTBOX_NOTIFICATION_CHANNEL_EVENT = 'settings.notification_channel_updated';
const OUTBOX_NOTIFICATION_DIGEST_EVENT = 'settings.notification_digest_updated';

const FALLBACK_LABELS = {
  title: 'Notifications',
  subtitle: 'When and how the system sends alerts.',
  channelsTitle: 'Channels',
  channelsSubtitle: 'Outbound channels the system can use.',
  email: 'Email',
  emailHint: 'Sent from no-reply@monopilot.app',
  verified: '✓ Verified',
  inAppBanners: 'In-app banners',
  inAppHint: 'Shown at the top of the UI.',
  sms: 'SMS',
  smsHint: 'Via Twilio — only used for critical alerts.',
  smsUsage: '{count} messages sent this month',
  slack: 'Slack',
  slackHint: 'Post alerts to a Slack channel.',
  configureSlack: 'Configure →',
  rulesTitle: 'Notification rules',
  rulesSubtitle: 'Which events trigger which notifications.',
  newRule: '+ New rule',
  on: 'On',
  trigger: 'Trigger',
  audience: 'Audience',
  channels: 'Channels',
  digestTitle: 'Digest emails',
  dailyPlantSummary: 'Daily plant summary',
  dailyPlantSummaryHint: 'Sent to Managers at 18:00.',
  weeklyNpdDigest: 'Weekly NPD digest',
  weeklyNpdDigestHint: 'Sent to NPD managers Monday 09:00.',
  monthlyComplianceReport: 'Monthly compliance report',
  monthlyComplianceReportHint: 'Sent to Admins on the 1st of each month.',
  loading: 'Loading notifications…',
  empty: 'No notification rules are configured yet.',
  error: 'Unable to load notification settings.',
} as const;

function interpolate(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

function translate(t: Translator, key: keyof typeof FALLBACK_LABELS, values?: Record<string, string | number>) {
  try {
    const value = t(key, values);
    if (value && value !== key) return value;
  } catch {
    // Locale message files are updated with this screen; fallback protects older preview deploys during rollout.
  }
  return interpolate(FALLBACK_LABELS[key], values);
}

async function buildLabels(locale: string): Promise<ServerNotificationsLabels> {
  const t = (await getTranslations({ locale, namespace: 'settings.notifications' })) as Translator;
  return {
    title: translate(t, 'title'),
    subtitle: translate(t, 'subtitle'),
    channelsTitle: translate(t, 'channelsTitle'),
    channelsSubtitle: translate(t, 'channelsSubtitle'),
    email: translate(t, 'email'),
    emailHint: translate(t, 'emailHint'),
    verified: translate(t, 'verified'),
    inAppBanners: translate(t, 'inAppBanners'),
    inAppHint: translate(t, 'inAppHint'),
    sms: translate(t, 'sms'),
    smsHint: translate(t, 'smsHint'),
    smsUsage: (count) => translate(t, 'smsUsage', { count }),
    slack: translate(t, 'slack'),
    slackHint: translate(t, 'slackHint'),
    configureSlack: translate(t, 'configureSlack'),
    rulesTitle: translate(t, 'rulesTitle'),
    rulesSubtitle: translate(t, 'rulesSubtitle'),
    newRule: translate(t, 'newRule'),
    on: translate(t, 'on'),
    trigger: translate(t, 'trigger'),
    audience: translate(t, 'audience'),
    channels: translate(t, 'channels'),
    digestTitle: translate(t, 'digestTitle'),
    dailyPlantSummary: translate(t, 'dailyPlantSummary'),
    dailyPlantSummaryHint: translate(t, 'dailyPlantSummaryHint'),
    weeklyNpdDigest: translate(t, 'weeklyNpdDigest'),
    weeklyNpdDigestHint: translate(t, 'weeklyNpdDigestHint'),
    monthlyComplianceReport: translate(t, 'monthlyComplianceReport'),
    monthlyComplianceReportHint: translate(t, 'monthlyComplianceReportHint'),
    loading: translate(t, 'loading'),
    empty: translate(t, 'empty'),
    error: translate(t, 'error'),
  };
}

function defaultChannels(labels: ServerNotificationsLabels, smsMessagesThisMonth: number): ChannelSetting[] {
  return [
    { id: 'email', label: labels.email, hint: labels.emailHint, enabled: true, verified: true },
    { id: 'in-app', label: labels.inAppBanners, hint: labels.inAppHint, enabled: true },
    {
      id: 'SMS',
      label: labels.sms,
      hint: labels.smsHint,
      enabled: true,
      usageText: labels.smsUsage(smsMessagesThisMonth),
    },
    { id: 'slack', label: labels.slack, hint: labels.slackHint, enabled: false },
  ];
}

function defaultDigestEmails(labels: NotificationsLabels): DigestSetting[] {
  return [
    { id: 'daily-plant-summary', label: labels.dailyPlantSummary, hint: labels.dailyPlantSummaryHint, enabled: true },
    { id: 'weekly-npd-digest', label: labels.weeklyNpdDigest, hint: labels.weeklyNpdDigestHint, enabled: true },
    {
      id: 'monthly-compliance-report',
      label: labels.monthlyComplianceReport,
      hint: labels.monthlyComplianceReportHint,
      enabled: false,
    },
  ];
}

async function readNotificationsData(labels: ServerNotificationsLabels): Promise<NotificationsReadResult> {
  try {
    return await withOrgContext(async ({ orgId, userId, client }) => {
      const queryClient = client as QueryClient;
      const [preferenceResult, smsResult] = await Promise.all([
        queryClient.query<NotificationPreferenceRow>(
          `select category, event, channel_email, channel_in_app
             from public.notification_preferences
            where org_id = $1::uuid
              and user_id = $2::uuid
            order by category, event`,
          [orgId, userId],
        ),
        queryClient.query<{ sent_count: string | number | null }>(
          `select count(*) as sent_count
             from public.outbox_events
            where org_id = $1::uuid
              and event_type like 'notification.%'
              and created_at >= date_trunc('month', now())`,
          [orgId],
        ),
      ]);

      const smsMessagesThisMonth = toNumber(smsResult.rows[0]?.sent_count, 0);
      const notificationRules = mapPreferenceRowsToRules(preferenceResult.rows);
      return {
        channels: defaultChannels(labels, smsMessagesThisMonth),
        notificationRules,
        digestEmails: defaultDigestEmails(labels),
        smsMessagesThisMonth,
        state: notificationRules.length > 0 ? 'ready' : 'empty',
      };
    });
  } catch {
    return {
      channels: defaultChannels(labels, 0),
      notificationRules: [],
      digestEmails: defaultDigestEmails(labels),
      smsMessagesThisMonth: 0,
      state: 'error',
    };
  }
}

function mapPreferenceRowsToRules(rows: NotificationPreferenceRow[]): NotificationRule[] {
  return rows
    .filter((row) => row.category !== 'digest')
    .map((row) => {
      const channel: NotificationChannel[] = [];
      if (row.channel_email) channel.push('email');
      if (row.channel_in_app) channel.push('in-app');
      return {
        id: `${row.category}:${row.event}`,
        on: channel.length > 0,
        trigger: humanizeToken(row.event),
        audience: humanizeToken(row.category),
        channel,
      };
    });
}

function humanizeToken(value: string) {
  return value
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toNumber(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRuleId(ruleId: string) {
  const [category, ...eventParts] = ruleId.split(':');
  const event = eventParts.join(':');
  if (!category || !event) throw new Error('invalid_notification_rule_id');
  return { category, event };
}

function assertKnownChannel(channelId: NotificationChannel) {
  if (!['email', 'in-app', 'SMS', 'slack'].includes(channelId)) throw new Error('invalid_notification_channel_id');
}

function assertKnownDigest(digestId: string) {
  if (!['daily-plant-summary', 'weekly-npd-digest', 'monthly-compliance-report'].includes(digestId)) {
    throw new Error('invalid_notification_digest_id');
  }
}

async function emitSettingsNotificationOutbox(
  client: QueryClient,
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await client.query(
    `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'notification_preferences', $1::uuid, $3::jsonb, $4)`,
    [orgId, eventType, JSON.stringify(payload), OUTBOX_APP_VERSION],
  );
}

async function defaultToggleNotificationRule(input: ToggleRuleInput): Promise<ToggleRuleResult> {
  'use server';

  const parsed = parseRuleId(input.ruleId);
  await withOrgContext(async ({ orgId, userId, client }) => {
    const queryClient = client as QueryClient;
    await queryClient.query(
      `insert into public.notification_preferences (user_id, org_id, category, event, channel_email, channel_in_app)
       values ($1::uuid, $2::uuid, $3, $4, $5, $5)
       on conflict (user_id, org_id, category, event)
       do update set channel_email = excluded.channel_email,
                     channel_in_app = excluded.channel_in_app`,
      [userId, orgId, parsed.category, parsed.event, input.enabled],
    );
    await emitSettingsNotificationOutbox(queryClient, orgId, OUTBOX_NOTIFICATION_RULE_EVENT, {
      ruleId: input.ruleId,
      category: parsed.category,
      event: parsed.event,
      enabled: input.enabled,
      actorUserId: userId,
    });
  });
  revalidatePath('/settings/notifications');
  return { ok: true, ruleId: input.ruleId, enabled: input.enabled, outboxEventType: OUTBOX_NOTIFICATION_RULE_EVENT };
}

async function defaultToggleNotificationChannel(input: ToggleChannelInput): Promise<ToggleChannelResult> {
  'use server';

  assertKnownChannel(input.channelId);
  await withOrgContext(async ({ orgId, userId, client }) => {
    const queryClient = client as QueryClient;
    if (input.channelId === 'email' || input.channelId === 'in-app') {
      const column = input.channelId === 'email' ? 'channel_email' : 'channel_in_app';
      await queryClient.query(
        `update public.notification_preferences
            set ${column} = $1
          where org_id = $2::uuid
            and user_id = $3::uuid`,
        [input.enabled, orgId, userId],
      );
    }
    await emitSettingsNotificationOutbox(queryClient, orgId, OUTBOX_NOTIFICATION_CHANNEL_EVENT, {
      channelId: input.channelId,
      enabled: input.enabled,
      actorUserId: userId,
    });
  });
  revalidatePath('/settings/notifications');
  return { ok: true, channelId: input.channelId, enabled: input.enabled, outboxEventType: OUTBOX_NOTIFICATION_CHANNEL_EVENT };
}

async function defaultToggleDigestEmail(input: ToggleDigestInput): Promise<ToggleDigestResult> {
  'use server';

  assertKnownDigest(input.digestId);
  await withOrgContext(async ({ orgId, userId, client }) => {
    const queryClient = client as QueryClient;
    await queryClient.query(
      `insert into public.notification_preferences (user_id, org_id, category, event, channel_email, channel_in_app)
       values ($1::uuid, $2::uuid, 'digest', $3, $4, false)
       on conflict (user_id, org_id, category, event)
       do update set channel_email = excluded.channel_email`,
      [userId, orgId, input.digestId, input.enabled],
    );
    await emitSettingsNotificationOutbox(queryClient, orgId, OUTBOX_NOTIFICATION_DIGEST_EVENT, {
      digestId: input.digestId,
      enabled: input.enabled,
      actorUserId: userId,
    });
  });
  revalidatePath('/settings/notifications');
  return { ok: true, digestId: input.digestId, enabled: input.enabled, outboxEventType: OUTBOX_NOTIFICATION_DIGEST_EVENT };
}

function toClientLabels(labels: ServerNotificationsLabels): NotificationsLabels {
  const { smsUsage: _smsUsage, ...serializableLabels } = labels;
  return serializableLabels;
}

export default async function SettingsNotificationsPage(props: NotificationsPageProps = {}) {
  const resolvedParams = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(resolvedParams.locale ?? 'en');
  const loaded = props.channels && props.notificationRules && props.digestEmails ? null : await readNotificationsData(labels);
  const state = props.state ?? loaded?.state ?? 'ready';

  return (
    <SettingsNotificationsScreen
      labels={toClientLabels(labels)}
      state={state}
      channels={props.channels ?? loaded?.channels ?? defaultChannels(labels, 0)}
      notificationRules={props.notificationRules ?? loaded?.notificationRules ?? []}
      digestEmails={props.digestEmails ?? loaded?.digestEmails ?? defaultDigestEmails(labels)}
      toggleNotificationChannel={props.toggleNotificationChannel ?? defaultToggleNotificationChannel}
      toggleNotificationRule={props.toggleNotificationRule ?? defaultToggleNotificationRule}
      toggleDigestEmail={props.toggleDigestEmail ?? defaultToggleDigestEmail}
    />
  );
}
