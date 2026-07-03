import { getTranslations } from 'next-intl/server';

import type { NotificationBellLabels } from '../../components/shell/notification-bell';

const DEFAULT_LABELS: NotificationBellLabels = {
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

export async function buildNotificationBellLabels(locale: string): Promise<NotificationBellLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'Topbar' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    return {
      trigger: pick('notificationsTrigger', DEFAULT_LABELS.trigger),
      unreadCount: pick('notificationsUnreadCount', DEFAULT_LABELS.unreadCount),
      empty: pick('notificationsEmpty', DEFAULT_LABELS.empty),
      markAllRead: pick('notificationsMarkAllRead', DEFAULT_LABELS.markAllRead),
      loading: pick('notificationsLoading', DEFAULT_LABELS.loading),
      loadError: pick('notificationsLoadError', DEFAULT_LABELS.loadError),
      relativeJustNow: pick('notificationsRelativeJustNow', DEFAULT_LABELS.relativeJustNow),
      relativeMinutes: pick('notificationsRelativeMinutes', DEFAULT_LABELS.relativeMinutes),
      relativeHours: pick('notificationsRelativeHours', DEFAULT_LABELS.relativeHours),
      relativeDays: pick('notificationsRelativeDays', DEFAULT_LABELS.relativeDays),
    };
  } catch {
    return { ...DEFAULT_LABELS };
  }
}
