'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type {
  InboxNotification,
  ListMyNotificationsResult,
  MarkAllNotificationsReadResult,
  MarkNotificationReadResult,
} from '../../lib/notifications/notification-types';

export type NotificationBellLabels = {
  trigger: string;
  unreadCount: string;
  empty: string;
  markAllRead: string;
  loading: string;
  loadError: string;
  relativeJustNow: string;
  relativeMinutes: string;
  relativeHours: string;
  relativeDays: string;
};

export type NotificationBellProps = {
  initialUnreadCount: number;
  labels: NotificationBellLabels;
  listNotificationsAction: (input?: { unreadOnly?: boolean }) => Promise<ListMyNotificationsResult>;
  markNotificationReadAction: (input: { id: string }) => Promise<MarkNotificationReadResult>;
  markAllNotificationsReadAction: () => Promise<MarkAllNotificationsReadResult>;
};

function formatRelativeTime(iso: string, labels: NotificationBellLabels, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return labels.relativeJustNow;
  if (minutes < 60) return labels.relativeMinutes.replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return labels.relativeHours.replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return labels.relativeDays.replace('{n}', String(days));
}

export function NotificationBell({
  initialUnreadCount,
  labels,
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount);
  const [notifications, setNotifications] = React.useState<InboxNotification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    void listNotificationsAction({ unreadOnly: false }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setLoadError(true);
        return;
      }
      setNotifications(result.notifications);
      setUnreadCount(result.notifications.filter((n) => !n.readAt).length);
    });

    return () => {
      cancelled = true;
    };
  }, [open, listNotificationsAction]);

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleMarkAllRead() {
    const result = await markAllNotificationsReadAction();
    if (!result.ok) return;
    setNotifications((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  async function handleNotificationClick(notification: InboxNotification) {
    if (!notification.readAt) {
      const result = await markNotificationReadAction({ id: notification.id });
      if (result.ok) {
        setNotifications((rows) =>
          rows.map((row) =>
            row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    }

    setOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  }

  const badge =
    unreadCount > 0 ? (
      <span
        data-testid="notification-bell-badge"
        className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
        aria-label={labels.unreadCount.replace('{n}', String(unreadCount))}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    ) : null;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        ref={triggerRef}
        data-testid="notification-bell-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.trigger}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-shell-border bg-shell-surface text-shell-fg transition hover:bg-shell-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-active-fg focus-visible:ring-offset-2 focus-visible:ring-offset-shell-bg"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M12 3a5 5 0 0 0-5 5v2.2c0 .5-.2 1-.5 1.4L5.1 14.3A1 1 0 0 0 6 16h12a1 1 0 0 0 .9-1.7l-1.4-2.7a2 2 0 0 1-.5-1.4V8a5 5 0 0 0-5-5Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
        {badge}
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          data-testid="notification-bell-dropdown"
          className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-shell-border bg-shell-surface text-sm text-shell-fg shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-shell-border px-4 py-3">
            <span className="font-semibold">{labels.trigger}</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                data-testid="notification-mark-all-read"
                onClick={() => void handleMarkAllRead()}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                {labels.markAllRead}
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? (
              <p className="px-2 py-4 text-center text-xs text-shell-muted" data-testid="notification-bell-loading">
                {labels.loading}
              </p>
            ) : null}
            {!loading && loadError ? (
              <p className="px-2 py-4 text-center text-xs text-red-700" data-testid="notification-bell-error">
                {labels.loadError}
              </p>
            ) : null}
            {!loading && !loadError && notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-shell-muted" data-testid="notification-bell-empty">
                {labels.empty}
              </p>
            ) : null}
            {!loading && !loadError
              ? notifications.map((notification) => {
                  const unread = !notification.readAt;
                  const content = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`font-medium ${unread ? 'text-shell-fg' : 'text-shell-muted'}`}>
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-shell-muted">
                          {formatRelativeTime(notification.createdAt, labels)}
                        </span>
                      </div>
                      {notification.body ? (
                        <p className={`mt-1 text-xs ${unread ? 'text-shell-fg' : 'text-shell-muted'}`}>
                          {notification.body}
                        </p>
                      ) : null}
                    </>
                  );

                  const rowClass = `block w-full rounded-lg px-3 py-2 text-left transition hover:bg-shell-active ${
                    unread ? 'bg-blue-50/60' : ''
                  }`;

                  return notification.link ? (
                    <Link
                      key={notification.id}
                      href={notification.link}
                      role="menuitem"
                      data-testid={`notification-row-${notification.id}`}
                      data-read={unread ? 'false' : 'true'}
                      className={rowClass}
                      onClick={(event) => {
                        event.preventDefault();
                        void handleNotificationClick(notification);
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      key={notification.id}
                      type="button"
                      role="menuitem"
                      data-testid={`notification-row-${notification.id}`}
                      data-read={unread ? 'false' : 'true'}
                      className={rowClass}
                      onClick={() => void handleNotificationClick(notification)}
                    >
                      {content}
                    </button>
                  );
                })
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NotificationBell;
