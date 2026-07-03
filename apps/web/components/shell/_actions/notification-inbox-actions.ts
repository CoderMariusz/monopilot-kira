'use server';

import {
  listMyNotifications,
  markAllRead,
  markNotificationRead,
} from '../../../app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions';

import type {
  ListMyNotificationsResult,
  MarkAllNotificationsReadResult,
  MarkNotificationReadResult,
  InboxNotification,
} from '../../../lib/notifications/notification-types';

function mapNotificationRow(row: Record<string, unknown>): InboxNotification {
  return {
    id: String(row.id),
    title: String(row.title),
    body: typeof row.body === 'string' ? row.body : null,
    link: typeof row.link === 'string' ? row.link : null,
    createdAt: String(row.createdAt),
    readAt: row.readAt == null ? null : String(row.readAt),
  };
}

export async function listNotificationsForInbox(input?: {
  unreadOnly?: boolean;
}): Promise<ListMyNotificationsResult> {
  const result = await listMyNotifications(input);
  if (!result.ok) {
    return { ok: false, error: 'list_failed' };
  }
  return {
    ok: true,
    notifications: result.notifications.map((row) =>
      mapNotificationRow(row as Record<string, unknown>),
    ),
  };
}

export async function markInboxNotificationRead(input: {
  id: string;
}): Promise<MarkNotificationReadResult> {
  const result = await markNotificationRead({ id: input.id });
  return result.ok ? { ok: true } : { ok: false, error: 'mark_read_failed' };
}

export async function markAllInboxNotificationsRead(): Promise<MarkAllNotificationsReadResult> {
  const result = await markAllRead();
  return result.ok ? { ok: true } : { ok: false, error: 'mark_all_failed' };
}
