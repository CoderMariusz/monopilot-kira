/** Shared notification inbox types (non-'use server' — safe for client + server imports). */

export type InboxNotification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export type ListMyNotificationsResult =
  | { ok: true; notifications: InboxNotification[] }
  | { ok: false; error: string };

export type MarkNotificationReadResult = { ok: true } | { ok: false; error: string };

export type MarkAllNotificationsReadResult = { ok: true } | { ok: false; error: string };
