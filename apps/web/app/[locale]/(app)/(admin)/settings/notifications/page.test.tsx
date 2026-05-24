/**
 * @vitest-environment jsdom
 * T-071 / SET-092 — Notifications screen RED tests.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/ops-screens.jsx:98-163.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
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
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

type NotificationChannel = 'email' | 'in-app' | 'SMS' | 'slack';

type NotificationRule = {
  id: string;
  on: boolean;
  trigger: string;
  audience: string;
  channel: NotificationChannel[];
};

type ChannelSetting = {
  id: NotificationChannel;
  label: string;
  hint: string;
  enabled: boolean;
  verified?: boolean;
  usageText?: string;
};

type DigestSetting = {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
};

type ToggleRuleInput = { ruleId: string; enabled: boolean };
type ToggleRuleResult = { ok: true; ruleId: string; enabled: boolean; outboxEventType: 'settings.notification_rule_updated' };

type NotificationsPageProps = {
  params?: Promise<{ locale: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  channels?: ChannelSetting[];
  notificationRules?: NotificationRule[];
  digestEmails?: DigestSetting[];
  toggleNotificationRule?: (input: ToggleRuleInput) => Promise<ToggleRuleResult>;
};

type NotificationsPage = (props: NotificationsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const channels: ChannelSetting[] = [
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

const notificationRules: NotificationRule[] = [
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

const digestEmails: DigestSetting[] = [
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

async function loadNotificationsPage(): Promise<NotificationsPage> {
  try {
    const pageModulePath = './' + 'page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(
      mod.default,
      'T-071 notifications page must default-export a renderable React component at app/[locale]/(app)/(admin)/settings/notifications/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as NotificationsPage;
  } catch {
    return function MissingNotificationsPage() {
      return React.createElement('main', { 'data-testid': 'missing-notifications-page' });
    };
  }
}

async function renderNotificationsPage(overrides: Partial<NotificationsPageProps> = {}) {
  const Page = await loadNotificationsPage();
  const props: NotificationsPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    state: 'ready',
    channels,
    notificationRules,
    digestEmails,
    toggleNotificationRule: vi.fn(async (input: ToggleRuleInput): Promise<ToggleRuleResult> => ({
      ok: true,
      ruleId: input.ruleId,
      enabled: input.enabled,
      outboxEventType: 'settings.notification_rule_updated',
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function screenRoot() {
  return screen.getByTestId('settings-notifications-screen');
}

function channelRows() {
  return screen.getAllByTestId('settings-notification-channel-row');
}

function ruleRows() {
  return screen.getAllByTestId('settings-notification-rule-row');
}

function digestRows() {
  return screen.getAllByTestId('settings-notification-digest-row');
}

function structuralSnapshot() {
  const root = screenRoot();
  return {
    prototypeSource: root.getAttribute('data-prototype-source'),
    route: root.getAttribute('data-route'),
    screen: root.getAttribute('data-screen'),
    regions: Array.from(root.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    sections: within(root)
      .getAllByTestId('settings-notifications-section')
      .map((section) => within(section).getByRole('heading', { level: 2 }).textContent),
    tableHeaders: within(root).getAllByRole('columnheader').map((header) => header.textContent),
    channelLabels: channelRows().map((row) => within(row).getByTestId('settings-notification-row-label').textContent),
    ruleTriggers: ruleRows().map((row) => within(row).getByTestId('settings-notification-rule-trigger').textContent),
    digestLabels: digestRows().map((row) => within(row).getByTestId('settings-notification-row-label').textContent),
  };
}

describe('T-071 notifications localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/notifications route under the AppShell route group', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/notifications/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/notifications/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/notifications/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-071 must implement /en/settings/notifications under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });
});

describe('T-071 AC-rls-force notification preference runtime invariant', () => {
  it('proves public.notification_preferences FORCE RLS and app.current_org_id() policy from live pg_catalog', async () => {
    const verificationCommand = `psql "$DATABASE_URL" -Atc "select c.relrowsecurity, c.relforcerowsecurity, count(p.policyname), count(*) filter (where coalesce(p.qual,'') || coalesce(p.with_check,'') like '%app.current_org_id()%') from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname where n.nspname = 'public' and c.relname = 'notification_preferences' group by c.relrowsecurity, c.relforcerowsecurity;"`;
    const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_OWNER;
    expect(
      databaseUrl,
      `AC-rls-force requires live DB evidence, not static migration grep. Set DATABASE_URL or DATABASE_URL_OWNER and run: ${verificationCommand}`,
    ).toBeTruthy();

    const pgModule = await import('pg');
    const Pool = (pgModule.default?.Pool ?? pgModule.Pool) as typeof pg.Pool;
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      const result = await pool.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
        policy_count: string;
        current_org_policy_count: string;
      }>(
        `select c.relrowsecurity,
                c.relforcerowsecurity,
                count(p.policyname)::text as policy_count,
                count(*) filter (
                  where (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%app.current_org_id()%'
                )::text as current_org_policy_count
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
          where n.nspname = 'public'
            and c.relname = 'notification_preferences'
          group by c.relrowsecurity, c.relforcerowsecurity`,
      );

      expect(result.rows, 'public.notification_preferences must exist in the migrated live DB').toHaveLength(1);
      expect(result.rows[0]?.relrowsecurity, 'RLS must be enabled on notification_preferences').toBe(true);
      expect(result.rows[0]?.relforcerowsecurity, 'FORCE ROW LEVEL SECURITY must be enabled').toBe(true);
      expect(Number(result.rows[0]?.policy_count ?? 0), 'at least one RLS policy must be installed').toBeGreaterThanOrEqual(1);
      expect(
        Number(result.rows[0]?.current_org_policy_count ?? 0),
        'notification_preferences policy must be scoped by app.current_org_id()',
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await pool.end();
    }
  });
});

describe('T-071 notifications_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/notifications');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders prototype regions, labels, table columns, shadcn switches, and keyboard focus order', async () => {
    const user = userEvent.setup();
    await renderNotificationsPage();

    expect(screen.getByRole('heading', { name: /^Notifications$/i })).toBeInTheDocument();
    expect(screen.getByText(/when and how the system sends alerts/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ New rule/i })).toHaveAttribute('data-slot', 'button');
    expect(document.querySelectorAll('[data-slot="switch"]').length).toBeGreaterThanOrEqual(
      channels.length + notificationRules.length + digestEmails.length,
    );
    expect(document.querySelectorAll('input[type="checkbox"]:not([role="switch"])')).toHaveLength(0);
    expect(screen.getByText('✓ Verified')).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByText('28 messages sent this month')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /configure/i })).toHaveAttribute('href', '/settings/integrations?highlight=slack');

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "channelLabels": [
          "Email",
          "In-app banners",
          "SMS",
          "Slack",
        ],
        "digestLabels": [
          "Daily plant summary",
          "Weekly NPD digest",
          "Monthly compliance report",
        ],
        "prototypeSource": "prototypes/design/Monopilot Design System/settings/ops-screens.jsx:98-163",
        "regions": [
          "page-head",
          "channels-section",
          "notification-rules-section",
          "digest-emails-section",
        ],
        "route": "/settings/notifications",
        "ruleTriggers": [
          "WO late to start",
          "Quality hold created",
          "D365 sync failed",
        ],
        "screen": "notifications_screen",
        "sections": [
          "Channels",
          "Notification rules",
          "Digest emails",
        ],
        "tableHeaders": [
          "On",
          "Trigger",
          "Audience",
          "Channels",
          "",
        ],
      }
    `);

    const focusableLabels = Array.from(screenRoot().querySelectorAll<HTMLElement>('button, [href], [role="switch"]'))
      .filter((element) => !element.hasAttribute('disabled'))
      .map((element) => element.textContent?.trim() || element.getAttribute('aria-label'));
    expect(focusableLabels.slice(0, 6)).toEqual([
      'Email',
      'In-app banners',
      'SMS',
      'Slack',
      'Configure →',
      '+ New rule',
    ]);

    await user.tab();
    expect(within(channelRows()[0]).getByRole('switch', { name: /email/i })).toHaveFocus();
    await user.tab();
    expect(within(channelRows()[1]).getByRole('switch', { name: /in-app banners/i })).toHaveFocus();
    await user.tab();
    expect(within(channelRows()[2]).getByRole('switch', { name: /sms/i })).toHaveFocus();
    await user.tab();
    expect(within(channelRows()[3]).getByRole('switch', { name: /slack/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: /configure/i })).toHaveFocus();
  });

  it('updates only the toggled notification rule row and requires the settings outbox event', async () => {
    const user = userEvent.setup();
    const toggleNotificationRule = vi.fn(async (input: ToggleRuleInput): Promise<ToggleRuleResult> => ({
      ok: true,
      ruleId: input.ruleId,
      enabled: input.enabled,
      outboxEventType: 'settings.notification_rule_updated',
    }));

    await renderNotificationsPage({ toggleNotificationRule });

    const d365Row = ruleRows().find((row) => within(row).queryByText('D365 sync failed'));
    expect(d365Row, 'D365 sync failure row must render before isolated toggle assertions run').toBeTruthy();

    await user.click(within(d365Row as HTMLElement).getByRole('switch', { name: /d365 sync failed/i }));

    expect(toggleNotificationRule).toHaveBeenCalledTimes(1);
    expect(toggleNotificationRule).toHaveBeenCalledWith({ ruleId: 'rule-d365-failed', enabled: true });
    const firstCallArg = toggleNotificationRule.mock.calls[0]?.[0];
    expect(firstCallArg).not.toHaveProperty('rules');
    await expect(toggleNotificationRule.mock.results[0].value).resolves.toMatchObject({
      ok: true,
      ruleId: 'rule-d365-failed',
      enabled: true,
      outboxEventType: 'settings.notification_rule_updated',
    });
  });

  it('routes Slack Configure to integrations with highlight=slack instead of opening a dead modal', async () => {
    const user = userEvent.setup();
    await renderNotificationsPage();

    await user.click(screen.getByRole('link', { name: /configure/i }));

    expect(routerPush).toHaveBeenCalledWith('/settings/integrations?highlight=slack');
  });

  it('renders loading, empty, and error states loudly for notification settings data', async () => {
    await renderNotificationsPage({ state: 'loading', notificationRules: [] });
    expect(screen.getByTestId('settings-notifications-loading')).toHaveTextContent(/loading notifications/i);
    cleanup();

    await renderNotificationsPage({ state: 'empty', notificationRules: [] });
    expect(screen.getByText(/no notification rules are configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ New rule/i })).toHaveAttribute('data-slot', 'button');
    cleanup();

    await renderNotificationsPage({ state: 'error', notificationRules: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load notification settings/i);
  });
});
