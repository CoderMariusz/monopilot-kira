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
import { resolve } from 'node:path';
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

const pagePath = resolve(process.cwd(), 'app/[locale]/(app)/(admin)/account/notifications/page.tsx');

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

// After the design-system migration the page is composed of shared `.sg-*`
// primitives: each `Section` is a labelled `role="region"` card (titled by its
// `.sg-section-title`) and each toggle is the `.sg-toggle` slider — a
// `label.sg-toggle > input[type=checkbox] + span.slider`. The page header is a
// `.sg-head` block (title `.sg-title`, sub `.sg-sub`), not an aria heading.
function orderedRegionNames() {
  return Array.from(document.querySelectorAll('.sg-head .sg-title, .sg-section'))
    .map((element) => {
      if (element.classList.contains('sg-title')) return element.textContent;
      return element.querySelector('.sg-section-title')?.textContent ?? null;
    })
    .filter((name): name is string => Boolean(name));
}

function toggleSummary() {
  return Array.from(document.querySelectorAll('label.sg-toggle')).map((toggle) => {
    const input = toggle.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    return {
      name: input?.getAttribute('aria-label') ?? null,
      checked: input?.checked ?? null,
      hasSlider: Boolean(toggle.querySelector('span.slider')),
    };
  });
}

function notificationSummary() {
  return {
    sectionOrder: orderedRegionNames(),
    head: screen.getByText(/^My notifications$/i).className,
    toggles: toggleSummary(),
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

  it('renders the prototype head + sections, labels, sg-toggle switches, quiet-hour inputs, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderMyNotifications();

    // Page header is the shared `.sg-head` block (not an aria heading).
    expect(container.querySelector('.sg-head .sg-title')).toHaveTextContent('My notifications');
    expect(screen.getByText(/choose which alerts reach you, and where/i)).toBeInTheDocument();
    // Section cards render in prototype order, each a labelled region.
    expect(orderedRegionNames()).toEqual(['My notifications', 'In-app', 'Email preferences', 'Quiet hours']);

    const perEvent = screen.getByRole('region', { name: /^Email preferences$/i });
    expect(within(perEvent).getByRole('checkbox', { name: /^Work order assigned to me$/i })).toBeChecked();
    expect(within(perEvent).getByRole('checkbox', { name: /^Approval requested$/i })).toBeChecked();
    expect(within(perEvent).getByRole('checkbox', { name: /^Daily plant summary$/i })).toBeChecked();
    expect(within(perEvent).getByText(/sent at 18:00 every workday/i)).toBeInTheDocument();
    expect(within(perEvent).getByRole('checkbox', { name: /^Weekly NPD digest$/i })).not.toBeChecked();
    expect(within(perEvent).getByRole('checkbox', { name: /^Product updates & tips$/i })).not.toBeChecked();
    expect(within(perEvent).getByText(/from monopilot/i)).toBeInTheDocument();

    const browserPush = screen.getByRole('region', { name: /^In-app$/i });
    expect(within(browserPush).getByRole('checkbox', { name: /^Show notification badges$/i })).toBeChecked();
    expect(within(browserPush).getByText(/red dot on sidebar modules with unread items/i)).toBeInTheDocument();
    expect(within(browserPush).getByRole('checkbox', { name: /^Desktop notifications$/i })).toBeChecked();
    expect(within(browserPush).getByText(/browser push notifications/i)).toBeInTheDocument();
    expect(within(browserPush).getByRole('checkbox', { name: /^Sound on alert$/i })).not.toBeChecked();

    const quietHours = screen.getByRole('region', { name: /^Quiet hours$/i });
    expect(within(quietHours).getByText(/pause non-critical notifications during these times/i)).toBeInTheDocument();
    expect(within(quietHours).getByRole('checkbox', { name: /^Enable quiet hours$/i })).not.toBeChecked();
    expect(within(quietHours).getByLabelText(/^From$/i)).toHaveValue('20:00');
    expect(within(quietHours).getByLabelText(/^To$/i)).toHaveValue('07:00');
    // Quiet-hours times have no storage column, so the FROM/TO inputs are
    // disabled (no silently-dropped input) and carry an explicit note. Only the
    // on/off toggle above is persisted.
    expect(within(quietHours).getByLabelText(/^From$/i)).toBeDisabled();
    expect(within(quietHours).getByLabelText(/^To$/i)).toBeDisabled();
    expect(within(quietHours).getByText(/custom quiet-hours times are not yet stored/i)).toBeInTheDocument();

    // Every toggle is the design-system `.sg-toggle` slider (label > checkbox + .slider),
    // NOT the old `<button role="switch">` and NOT the shadcn Switch.
    expect(document.querySelectorAll('label.sg-toggle')).toHaveLength(9);
    expect(document.querySelectorAll('button[role="switch"]')).toHaveLength(0);
    for (const toggle of Array.from(document.querySelectorAll('label.sg-toggle'))) {
      expect(toggle.querySelector('input[type="checkbox"]')).not.toBeNull();
      expect(toggle.querySelector('span.slider')).not.toBeNull();
    }

    await user.tab();
    expect(screen.getByRole('checkbox', { name: /^Show notification badges$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: /^Desktop notifications$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: /^Sound on alert$/i })).toHaveFocus();

    expect(notificationSummary()).toMatchInlineSnapshot(`
      {
        "head": "sg-title",
        "quietHourInputs": [
          "time",
          "time",
        ],
        "sectionOrder": [
          "My notifications",
          "In-app",
          "Email preferences",
          "Quiet hours",
        ],
        "toggles": [
          {
            "checked": true,
            "hasSlider": true,
            "name": "Show notification badges",
          },
          {
            "checked": true,
            "hasSlider": true,
            "name": "Desktop notifications",
          },
          {
            "checked": false,
            "hasSlider": true,
            "name": "Sound on alert",
          },
          {
            "checked": true,
            "hasSlider": true,
            "name": "Work order assigned to me",
          },
          {
            "checked": true,
            "hasSlider": true,
            "name": "Approval requested",
          },
          {
            "checked": true,
            "hasSlider": true,
            "name": "Daily plant summary",
          },
          {
            "checked": false,
            "hasSlider": true,
            "name": "Weekly NPD digest",
          },
          {
            "checked": false,
            "hasSlider": true,
            "name": "Product updates & tips",
          },
          {
            "checked": false,
            "hasSlider": true,
            "name": "Enable quiet hours",
          },
        ],
      }
    `);
  });

  it('renders loading, empty, error, and permission-denied states without silently skipping invariants', async () => {
    await renderMyNotifications({ state: 'loading' });
    expect(screen.getByTestId('my-notifications-loading')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /desktop notifications/i })).not.toBeInTheDocument();

    cleanup();
    await renderMyNotifications({ state: 'empty' });
    expect(screen.getByRole('status')).toHaveTextContent(/no notification preferences are available/i);

    cleanup();
    await renderMyNotifications({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/notification preferences could not be loaded/i);

    cleanup();
    await renderMyNotifications({ state: 'permission-denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('checkbox', { name: /desktop notifications/i })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('checkbox', { name: /^Desktop notifications$/i }));

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

  it('persists the quiet-hours on/off toggle (the only stored field) and disables the unstored FROM/TO time inputs', async () => {
    const user = userEvent.setup();
    const saveNotificationPreferences = vi.fn().mockResolvedValue({
      ok: true,
      userPreferencesRowUpdated: true,
    });

    await renderMyNotifications({ saveNotificationPreferences });

    // `notification_preferences` has no quiet-hours time columns, so the FROM/TO
    // inputs are rendered disabled (no silently-dropped input) with an explicit
    // note. They keep showing the read defaults but cannot be edited.
    const fromInput = screen.getByLabelText(/^From$/i);
    const toInput = screen.getByLabelText(/^To$/i);
    expect(fromInput).toBeDisabled();
    expect(toInput).toBeDisabled();
    expect(fromInput).toHaveValue('20:00');
    expect(toInput).toHaveValue('07:00');
    expect(screen.getByText(/custom quiet-hours times are not yet stored/i)).toBeInTheDocument();

    // The on/off toggle is the only quiet-hours field with real storage; saving
    // persists it through the user_preferences action.
    await user.click(screen.getByRole('checkbox', { name: /^Enable quiet hours$/i }));
    await user.click(screen.getByRole('button', { name: /^Save changes$/i }));

    expect(saveNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-k-nowak',
        quiet_hours_enabled: true,
      }),
    );
    expect(await screen.findByText(/user_preferences updated/i)).toBeInTheDocument();
  });
});

describe('SET-102 real preferences fetch (no injected props)', () => {
  it('reads the signed-in user\'s REAL preferences via readMyNotificationPreferences and uses the REAL userId (never current-user)', async () => {
    vi.resetModules();
    const readMyNotificationPreferences = vi.fn().mockResolvedValue({
      state: 'ready',
      userId: 'real-user-uuid',
      preferences: {
        notification_badges: true,
        browser_push: true,
        sound_on_alert: true, // stored real value differs from the prototype default (false)
        work_order_assigned: true,
        approval_requested: true,
        daily_plant_summary: true,
        weekly_npd_digest: false,
        product_updates_tips: false,
        quiet_hours_enabled: false,
        quiet_hours_from: '20:00',
        quiet_hours_to: '07:00',
      },
    });
    const saveNotificationPreferencesAction = vi.fn().mockResolvedValue({ ok: true });

    vi.doMock('./notifications-data', async () => {
      const actual = await vi.importActual<typeof import('./notifications-data')>('./notifications-data');
      return { ...actual, readMyNotificationPreferences, saveNotificationPreferencesAction };
    });

    const mod = await import('./page');
    const node = await (mod.default as (props?: unknown) => Promise<React.ReactNode>)({});
    render(React.createElement(React.Fragment, null, node));

    // Server Component performed the REAL preferences read (no injected props).
    expect(readMyNotificationPreferences).toHaveBeenCalledTimes(1);
    // The REAL stored value (sound_on_alert=true) is reflected — not the
    // hardcoded prototype default of false.
    expect(screen.getByRole('checkbox', { name: /^Sound on alert$/i })).toBeChecked();

    // Saving uses the REAL signed-in userId, never the old 'current-user' literal.
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /^Enable quiet hours$/i }));
    await user.click(screen.getByRole('button', { name: /^Save changes$/i }));
    expect(saveNotificationPreferencesAction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'real-user-uuid' }),
    );
    expect(saveNotificationPreferencesAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'current-user' }),
    );

    vi.doUnmock('./notifications-data');
    vi.resetModules();
  });
});
