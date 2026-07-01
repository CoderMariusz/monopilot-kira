import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export const OEE_ANDON_VIEW_PERMISSION = 'oee.tv.kiosk_view';

export async function canViewAndonKiosk(): Promise<boolean> {
  return withOrgContext(async (ctx) => hasPermission(ctx, OEE_ANDON_VIEW_PERMISSION));
}
