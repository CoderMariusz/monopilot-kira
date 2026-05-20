/**
 * @vitest-environment jsdom
 * T-075 / SET-102 — My Notifications screen
 *
 * RED phase: these RTL tests specify my_notifications_screen production behavior from
 * prototypes/design/Monopilot Design System/settings/account-screens.jsx:77-124.
 * Missing production page modules render an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise; if page.tsx
 * exists, import/syntax errors are allowed to fail loudly.
 */

import React from 'react';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  userId: string;
  preferences: NotificationPreferences;
  browserPushSubscription: BrowserPushSubscription | null;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveNotificationPreferences: ReturnType<typeof vi.fn>;
  persistBrowserPushSubscription: ReturnType<typeof vi.fn>;
};

type MyNotificationsPage = (props: MyNotificationsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(__dirname, 'page.tsx');

const basePreferences: NotificationPreferences = {
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

async function loadMyNotificationsPage(): Promise<MyNotificationsPage> {
  if (!existsSync(pagePath)) {
    return function MissingMyNotificationsPage() {
      return React.createElement('main', { 'data-testid': 'missing-my-notifications-page' });
    };
  }

  const pageModulePath = './page';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-102 my notifications page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as MyNotificationsPage;
}

async function renderMyNotifications(overrides: Partial<MyNotificationsPageProps> = {}) {
  const Page = await loadMyNotificationsPage();
  const props: MyNotificationsPageProps = {
    userId: 'user-k-nowak',
    preferences: basePreferences,
    browserPushSubscription: {
      endpoint: 'https://push.example/sub-existing',
      keys: { p256dh: 'existing-p256dh', auth: 'existing-auth' },
    },
    state: 'ready',
    saveNotificationPreferences: vi.fn().mockResolvedValue({ ok: true, userPreferencesRowUpdated: true }),
    persistBrowserPushSubscription: vi.fn().mockResolvedValue({ ok: true, subscriptionId: 'push-sub-1' }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<MyNotificationsPageProps>, props)) };
}

function orderedRegions() {
  return Array.from(document.querySelectorAll('[data-region]')).map((element) => element.getAttribute('data-region'));
}

function notificationSummary() {
  return {
    regions: orderedRegions(),
    headings: screen.getAllByRole('heading').map((heading) => heading.textContent),
    switches: screen.getAllByRole('switch').map((control) => ({
      name: control.getAttribute('aria-label'),
      checked: control.getAttribute('aria-checked'),
      slot: control.getAttribute('data-slot'),
    })),
    quietHourInputs: [
      screen.getByLabelText(/^From$/i).getAttribute('type'),
      screen.getByLabelText(/^To$/i).getAttribute('type'),
    ],
  };
}

function installPushMocks() {
  const subscription = {
    endpoint: 'https://push.example/sub-new',
    keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
    toJSON() {
      return { endpoint: this.endpoint, keys: this.keys };
    },
  };
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });

  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });

  return { register, subscribe, subscription: subscription.toJSON() };
}

describe('SET-102 my_notifications_screen prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the prototype regions, labels, shadcn switches, quiet-hour inputs, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderMyNotifications();

    expect(screen.getByRole('heading', { name: /^My notifications$/i })).toBeInTheDocument();
    expect(screen.getByText(/choose which alerts reach you, and where/i)).toBeInTheDocument();
    expect(orderedRegions()).toEqual(['page-head', 'per-event-prefs', 'browser-push', 'quiet-hours']);

    const perEvent = screen.getByRole('region', { name: /^Email preferences$/i });
    expect(within(perEvent).getByRole('switch', { name: /^Work order assigned to me$/i })).toBeChecked();
    expect(within(perEvent).getByRole('switch', { name: /^Approval requested$/i })).toBeChecked();
    expect(within(perEvent).getByRole('switch', { name: /^Daily plant summary$/i })).toBeChecked();
    expect(within(perEvent).getByText(/sent at 18:00 every workday/i)).toBeInTheDocument();
    expect(within(perEvent).getByRole('switch', { name: /^Weekly NPD digest$/i })).not.toBeChecked();
    expect(within(perEvent).getByRole('switch', { name: /^Product updates & tips$/i })).not.toBeChecked();
    expect(within(perEvent).getByText(/from monopilot/i)).toBeInTheDocument();

    const browserPush = screen.getByRole('region', { name: /^In-app$/i });
    expect(within(browserPush).getByRole('switch', { name: /^Show notification badges$/i })).toBeChecked();
    expect(within(browserPush).getByText(/red dot on sidebar modules with unread items/i)).toBeInTheDocument();
    expect(within(browserPush).getByRole('switch', { name: /^Desktop notifications$/i })).toBeChecked();
    expect(within(browserPush).getByText(/browser push notifications/i)).toBeInTheDocument();
    expect(within(browserPush).getByRole('switch', { name: /^Sound on alert$/i })).not.toBeChecked();

    const quietHours = screen.getByRole('region', { name: /^Quiet hours$/i });
    expect(within(quietHours).getByText(/pause non-critical notifications during these times/i)).toBeInTheDocument();
    expect(within(quietHours).getByRole('switch', { name: /^Enable quiet hours$/i })).not.toBeChecked();
    expect(within(quietHours).getByLabelText(/^From$/i)).toHaveValue('20:00');
    expect(within(quietHours).getByLabelText(/^To$/i)).toHaveValue('07:00');

    for (const control of screen.getAllByRole('switch')) {
      expect(control).toHaveAttribute('data-slot', 'switch');
    }

    await user.tab();
    expect(screen.getByRole('switch', { name: /^Work order assigned to me$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /^Approval requested$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /^Daily plant summary$/i })).toHaveFocus();

    expect(notificationSummary()).toMatchInlineSnapshot(`
      {
        "headings": [
          "My notifications",
          "Email preferences",
          "In-app",
          "Quiet hours",
        ],
        "quietHourInputs": [
          "time",
          "time",
        ],
        "regions": [
          "page-head",
          "per-event-prefs",
          "browser-push",
          "quiet-hours",
        ],
        "switches": [
          {
            "checked": "true",
            "name": "Work order assigned to me",
            "slot": "switch",
          },
          {
            "checked": "true",
            "name": "Approval requested",
            "slot": "switch",
          },
          {
            "checked": "true",
            "name": "Daily plant summary",
            "slot": "switch",
          },
          {
            "checked": "false",
            "name": "Weekly NPD digest",
            "slot": "switch",
          },
          {
            "checked": "false",
            "name": "Product updates & tips",
            "slot": "switch",
          },
          {
            "checked": "true",
            "name": "Show notification badges",
            "slot": "switch",
          },
          {
            "checked": "true",
            "name": "Desktop notifications",
            "slot": "switch",
          },
          {
            "checked": "false",
            "name": "Sound on alert",
            "slot": "switch",
          },
          {
            "checked": "false",
            "name": "Enable quiet hours",
            "slot": "switch",
          },
        ],
      }
    `);
  });

  it('renders loading, empty, error, and permission-denied states without silently skipping invariants', async () => {
    await renderMyNotifications({ state: 'loading' });
    expect(screen.getByTestId('my-notifications-loading')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /desktop notifications/i })).not.toBeInTheDocument();

    cleanup();
    await renderMyNotifications({ state: 'empty' });
    expect(screen.getByRole('status')).toHaveTextContent(/no notification preferences are available/i);

    cleanup();
    await renderMyNotifications({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/notification preferences could not be loaded/i);

    cleanup();
    await renderMyNotifications({ state: 'permission-denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('switch', { name: /desktop notifications/i })).not.toBeInTheDocument();
  });
});

describe('SET-102 notification preference mutations', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('registers service worker push and persists the subscription handle when browser push is toggled on', async () => {
    const user = userEvent.setup();
    const push = installPushMocks();
    const persistBrowserPushSubscription = vi.fn().mockResolvedValue({ ok: true, subscriptionId: 'push-sub-1' });

    await renderMyNotifications({
      preferences: { ...basePreferences, browser_push: false },
      browserPushSubscription: null,
      persistBrowserPushSubscription,
    });

    await user.click(screen.getByRole('switch', { name: /^Desktop notifications$/i }));

    expect(push.register).toHaveBeenCalledWith('/sw.js');
    expect(push.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.anything() }),
    );
    expect(persistBrowserPushSubscription).toHaveBeenCalledWith({
      userId: 'user-k-nowak',
      subscription: push.subscription,
    });
    expect(await screen.findByText(/browser push subscription saved/i)).toBeInTheDocument();
  });

  it("persists quiet_hours_from='22:00' and quiet_hours_to='07:00' to the user_preferences action", async () => {
    const user = userEvent.setup();
    const saveNotificationPreferences = vi.fn().mockResolvedValue({
      ok: true,
      userPreferencesRowUpdated: true,
      row: { quiet_hours_from: '22:00', quiet_hours_to: '07:00' },
    });

    await renderMyNotifications({ saveNotificationPreferences });

    await user.click(screen.getByRole('switch', { name: /^Enable quiet hours$/i }));
    await user.clear(screen.getByLabelText(/^From$/i));
    await user.type(screen.getByLabelText(/^From$/i), '22:00');
    await user.clear(screen.getByLabelText(/^To$/i));
    await user.type(screen.getByLabelText(/^To$/i), '07:00');
    await user.click(screen.getByRole('button', { name: /^Save changes$/i }));

    expect(saveNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-k-nowak',
        quiet_hours_enabled: true,
        quiet_hours_from: '22:00',
        quiet_hours_to: '07:00',
      }),
    );
    expect(await screen.findByText(/user_preferences updated/i)).toBeInTheDocument();
    expect(await screen.findByText(/quiet_hours_from=22:00/i)).toBeInTheDocument();
    expect(await screen.findByText(/quiet_hours_to=07:00/i)).toBeInTheDocument();
  });
});
