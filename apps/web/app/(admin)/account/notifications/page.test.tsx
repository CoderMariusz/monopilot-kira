/**
 * @vitest-environment jsdom
 * T-075 / SET-102 — My Notifications preferences screen
 *
 * RED phase: these RTL tests specify the production my_notifications_screen
 * behavior from prototypes/design/Monopilot Design System/settings/account-screens.jsx:77-124.
 * Missing production page modules render an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type NotificationPreferencesPageProps = {
  preferences: NotificationPreferences;
  canEdit: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  savePreferences: ReturnType<typeof vi.fn>;
  savePushSubscription: ReturnType<typeof vi.fn>;
};

type NotificationPreferencesPage = (
  props: NotificationPreferencesPageProps,
) => React.ReactNode | Promise<React.ReactNode>;

const preferences: NotificationPreferences = {
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

async function loadNotificationsPage(): Promise<NotificationPreferencesPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-102 notifications page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as NotificationPreferencesPage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("./page") && !message.includes('/account/notifications/page')) {
      throw error;
    }

    return function MissingNotificationsPage() {
      return React.createElement('main', { 'data-testid': 'missing-notifications-page' });
    };
  }
}

async function renderNotifications(overrides: Partial<NotificationPreferencesPageProps> = {}) {
  const Page = await loadNotificationsPage();
  const props: NotificationPreferencesPageProps = {
    preferences,
    canEdit: true,
    state: 'ready',
    savePreferences: vi.fn().mockImplementation(async (input: Partial<NotificationPreferences>) => ({
      ok: true,
      user_preferences: { ...preferences, ...input },
    })),
    savePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<NotificationPreferencesPageProps>, props)),
  };
}

function sectionSummary() {
  return {
    headings: screen.getAllByRole('heading').map((heading) => heading.textContent),
    regions: screen.getAllByRole('region').map((region) => region.getAttribute('aria-label')),
    switches: screen.getAllByRole('switch').map((control) => ({
      name: control.getAttribute('aria-label') ?? control.textContent,
      checked: control.getAttribute('aria-checked'),
    })),
    textboxes: screen.getAllByRole('textbox').map((control) => control.getAttribute('aria-label') ?? control.id),
  };
}

function installPushMocks() {
  const subscription = {
    endpoint: 'https://push.example/subscriptions/user-1',
    expirationTime: null,
    getKey: vi.fn(),
    toJSON: () => ({
      endpoint: 'https://push.example/subscriptions/user-1',
      keys: { p256dh: 'fixture-p256dh', auth: 'fixture-auth' },
    }),
  } as unknown as PushSubscription;
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });

  return { register, subscribe, subscription: subscription.toJSON() };
}

describe('SET-102 my_notifications_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders the prototype sections, row labels, shadcn switches, states, action rules, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderNotifications();

    expect(screen.getByRole('heading', { name: /my notifications/i })).toBeInTheDocument();
    expect(screen.getByText(/choose which alerts reach you, and where/i)).toBeInTheDocument();

    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'In-app',
      'Email preferences',
      'Quiet hours',
    ]);

    const inApp = screen.getByRole('region', { name: /in-app/i });
    expect(within(inApp).getByRole('switch', { name: /show notification badges/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(inApp).getByText(/red dot on sidebar modules with unread items/i)).toBeInTheDocument();
    expect(within(inApp).getByRole('switch', { name: /desktop notifications/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(inApp).getByText(/browser push notifications/i)).toBeInTheDocument();
    expect(within(inApp).getByRole('switch', { name: /sound on alert/i })).toHaveAttribute('aria-checked', 'false');

    const email = screen.getByRole('region', { name: /email preferences/i });
    expect(within(email).getByRole('switch', { name: /work order assigned to me/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(email).getByRole('switch', { name: /approval requested/i })).toHaveAttribute('aria-checked', 'true');
    expect(within(email).getByRole('switch', { name: /daily plant summary/i })).toHaveAttribute('aria-checked', 'true');
    expect(within(email).getByText(/sent at 18:00 every workday/i)).toBeInTheDocument();
    expect(within(email).getByRole('switch', { name: /weekly npd digest/i })).toHaveAttribute('aria-checked', 'false');
    expect(within(email).getByRole('switch', { name: /product updates & tips/i })).toHaveAttribute('aria-checked', 'false');
    expect(within(email).getByText(/from monopilot/i)).toBeInTheDocument();

    const quietHours = screen.getByRole('region', { name: /quiet hours/i });
    expect(within(quietHours).getByText(/pause non-critical notifications during these times/i)).toBeInTheDocument();
    expect(within(quietHours).getByRole('switch', { name: /enable quiet hours/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(quietHours).getByLabelText(/^from$/i)).toHaveValue('20:00');
    expect(within(quietHours).getByLabelText(/^to$/i)).toHaveValue('07:00');
    expect(within(quietHours).getByText('→')).toBeInTheDocument();

    expect(container.querySelectorAll('[data-slot="card"]').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('[data-slot="switch"]').length).toBe(9);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /save changes/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('switch', { name: /show notification badges/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /desktop notifications/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /sound on alert/i })).toHaveFocus();

    expect(sectionSummary()).toMatchInlineSnapshot(`
      {
        "headings": [
          "My notifications",
          "In-app",
          "Email preferences",
          "Quiet hours",
        ],
        "regions": [
          "In-app",
          "Email preferences",
          "Quiet hours",
        ],
        "switches": [
          {
            "checked": "true",
            "name": "Show notification badges",
          },
          {
            "checked": "false",
            "name": "Desktop notifications",
          },
          {
            "checked": "false",
            "name": "Sound on alert",
          },
          {
            "checked": "true",
            "name": "Work order assigned to me",
          },
          {
            "checked": "true",
            "name": "Approval requested",
          },
          {
            "checked": "true",
            "name": "Daily plant summary",
          },
          {
            "checked": "false",
            "name": "Weekly NPD digest",
          },
          {
            "checked": "false",
            "name": "Product updates & tips",
          },
          {
            "checked": "false",
            "name": "Enable quiet hours",
          },
        ],
        "textboxes": [
          "From",
          "To",
        ],
      }
    `);
  });

  it('renders explicit loading, empty, error, and permission-denied states without silently skipping controls', async () => {
    await renderNotifications({ state: 'loading' });
    expect(screen.getByTestId('notification-preferences-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    cleanup();
    await renderNotifications({ state: 'empty' });
    expect(screen.getByRole('status')).toHaveTextContent(/no notification preferences/i);

    cleanup();
    await renderNotifications({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/notification preferences could not be loaded/i);

    cleanup();
    await renderNotifications({ canEdit: false, state: 'permission-denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('switch', { name: /desktop notifications/i })).not.toBeInTheDocument();
  });

  it('registers service worker push, subscribes through PushManager, and persists the subscription handle when desktop notifications are enabled', async () => {
    const pushMocks = installPushMocks();
    const user = userEvent.setup();
    const { props } = await renderNotifications();

    await user.click(screen.getByRole('switch', { name: /desktop notifications/i }));

    await waitFor(() => expect(pushMocks.register).toHaveBeenCalledTimes(1));
    expect(pushMocks.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    await waitFor(() =>
      expect(props.savePushSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: pushMocks.subscription.endpoint,
          keys: pushMocks.subscription.keys,
        }),
      ),
    );
  });

  it('saves quiet_hours_from and quiet_hours_to to the user_preferences payload', async () => {
    const user = userEvent.setup();
    const { props } = await renderNotifications();

    await user.click(screen.getByRole('switch', { name: /enable quiet hours/i }));
    await user.clear(screen.getByLabelText(/^from$/i));
    await user.type(screen.getByLabelText(/^from$/i), '22:00');
    await user.clear(screen.getByLabelText(/^to$/i));
    await user.type(screen.getByLabelText(/^to$/i), '07:00');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(props.savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          quietHoursEnabled: true,
          quiet_hours_from: '22:00',
          quiet_hours_to: '07:00',
        }),
      ),
    );
    await expect(props.savePreferences.mock.results[0].value).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        user_preferences: expect.objectContaining({
          quiet_hours_from: '22:00',
          quiet_hours_to: '07:00',
        }),
      }),
    );
  });
});
