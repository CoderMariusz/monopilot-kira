/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import {
  NotificationBell,
  type NotificationBellLabels,
} from '../notification-bell';

const labels: NotificationBellLabels = {
  trigger: 'Notifications',
  unreadCount: '{n} unread notifications',
  empty: 'No notifications',
  markAllRead: 'Mark all read',
  loading: 'Loading notifications…',
  loadError: 'Could not load notifications.',
  relativeJustNow: 'Just now',
  relativeMinutes: '{n}m ago',
  relativeHours: '{n}h ago',
  relativeDays: '{n}d ago',
};

const notifications = [
  {
    id: 'n-1',
    title: 'WIP updated',
    body: 'Sauce base v3',
    link: '/en/pipeline/proj-1/formulation',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    readAt: null,
  },
  {
    id: 'n-2',
    title: 'Earlier note',
    body: null,
    link: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    readAt: new Date().toISOString(),
  },
];

afterEach(() => cleanup());

describe('NotificationBell', () => {
  it('renders unread badge and loads notifications on open', async () => {
    const listNotificationsAction = vi.fn().mockResolvedValue({ ok: true, notifications });
    const markNotificationReadAction = vi.fn().mockResolvedValue({ ok: true });
    const markAllNotificationsReadAction = vi.fn().mockResolvedValue({ ok: true });

    render(
      <NotificationBell
        initialUnreadCount={1}
        labels={labels}
        listNotificationsAction={listNotificationsAction}
        markNotificationReadAction={markNotificationReadAction}
        markAllNotificationsReadAction={markAllNotificationsReadAction}
      />,
    );

    expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('1');

    await userEvent.click(screen.getByTestId('notification-bell-trigger'));

    await waitFor(() => {
      expect(listNotificationsAction).toHaveBeenCalledWith({ unreadOnly: false });
    });

    expect(screen.getByTestId('notification-row-n-1')).toHaveAttribute('data-read', 'false');
    expect(screen.getByText('WIP updated')).toBeInTheDocument();
  });

  it('marks a notification read when clicked and calls mark-read action', async () => {
    const listNotificationsAction = vi.fn().mockResolvedValue({ ok: true, notifications });
    const markNotificationReadAction = vi.fn().mockResolvedValue({ ok: true });
    const markAllNotificationsReadAction = vi.fn().mockResolvedValue({ ok: true });
    push.mockClear();

    render(
      <NotificationBell
        initialUnreadCount={1}
        labels={labels}
        listNotificationsAction={listNotificationsAction}
        markNotificationReadAction={markNotificationReadAction}
        markAllNotificationsReadAction={markAllNotificationsReadAction}
      />,
    );

    await userEvent.click(screen.getByTestId('notification-bell-trigger'));
    await waitFor(() => expect(screen.getByTestId('notification-row-n-1')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('notification-row-n-1'));

    await waitFor(() => {
      expect(markNotificationReadAction).toHaveBeenCalledWith({ id: 'n-1' });
    });
  });

  it('marks all read from the dropdown header action', async () => {
    const listNotificationsAction = vi.fn().mockResolvedValue({ ok: true, notifications });
    const markNotificationReadAction = vi.fn().mockResolvedValue({ ok: true });
    const markAllNotificationsReadAction = vi.fn().mockResolvedValue({ ok: true });

    render(
      <NotificationBell
        initialUnreadCount={1}
        labels={labels}
        listNotificationsAction={listNotificationsAction}
        markNotificationReadAction={markNotificationReadAction}
        markAllNotificationsReadAction={markAllNotificationsReadAction}
      />,
    );

    await userEvent.click(screen.getByTestId('notification-bell-trigger'));
    await waitFor(() => expect(screen.getByTestId('notification-mark-all-read')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('notification-mark-all-read'));

    await waitFor(() => {
      expect(markAllNotificationsReadAction).toHaveBeenCalled();
    });
  });
});
