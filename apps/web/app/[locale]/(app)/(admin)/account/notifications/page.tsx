import React from 'react';

import MyNotificationsScreen, {
  type MyNotificationsPageProps as ClientProps,
} from './notifications-screen.client';
import {
  readMyNotificationPreferences,
  saveNotificationPreferencesAction,
  type NotificationPreferences,
  type NotificationsData,
} from './notifications-data';

export const dynamic = 'force-dynamic';

type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type MyNotificationsPageProps = {
  params?: Promise<{ locale: string }> | { locale: string };
  // Test seam only: production resolves the signed-in user + real preferences
  // in this Server Component. These typed overrides keep the RTL parity tests
  // focused without reintroducing hardcoded defaults or a 'current-user' literal.
  userId?: string;
  preferences?: NotificationPreferences;
  browserPushSubscription?: BrowserPushSubscription | null;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveNotificationPreferences?: ClientProps['saveNotificationPreferences'];
  persistBrowserPushSubscription?: ClientProps['persistBrowserPushSubscription'];
};

export default async function MyNotificationsPage(props: MyNotificationsPageProps = {}) {
  // Explicit non-ready overrides (parity tests) short-circuit to the client's
  // own state shells without a DB read.
  if (props.state && props.state !== 'ready') {
    return (
      <MyNotificationsScreen
        userId={props.userId}
        preferences={props.preferences}
        browserPushSubscription={props.browserPushSubscription ?? null}
        state={props.state}
        saveNotificationPreferences={props.saveNotificationPreferences ?? saveNotificationPreferencesAction}
        persistBrowserPushSubscription={props.persistBrowserPushSubscription}
      />
    );
  }

  // Test seam vs. production read of the real signed-in user's preferences.
  const data: NotificationsData =
    props.userId && props.preferences
      ? { state: 'ready', userId: props.userId, preferences: props.preferences }
      : await readMyNotificationPreferences();

  if (data.state === 'error' || !data.userId) {
    return (
      <MyNotificationsScreen
        userId={data.userId ?? undefined}
        preferences={data.preferences}
        browserPushSubscription={null}
        state="error"
        saveNotificationPreferences={saveNotificationPreferencesAction}
      />
    );
  }

  return (
    <MyNotificationsScreen
      userId={data.userId}
      preferences={data.preferences}
      browserPushSubscription={props.browserPushSubscription ?? null}
      state="ready"
      saveNotificationPreferences={props.saveNotificationPreferences ?? saveNotificationPreferencesAction}
      persistBrowserPushSubscription={props.persistBrowserPushSubscription}
    />
  );
}
