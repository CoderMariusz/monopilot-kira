import { listMyNotifications } from '../../app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions';

/**
 * Server-only unread badge count for the shell topbar.
 * L8 import is isolated here so presentational shell tests avoid the module graph.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const result = await listMyNotifications({ unreadOnly: true });
    if (!result.ok) return 0;
    return result.notifications.length;
  } catch {
    return 0;
  }
}
