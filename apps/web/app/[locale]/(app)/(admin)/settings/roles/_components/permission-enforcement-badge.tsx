'use client';

import { Badge } from '@monopilot/ui/Badge';
import { useTranslations } from 'next-intl';

import { isEnforcedPermission } from '../../../../../../../lib/rbac/enforced-permissions';

export function PermissionEnforcementBadge({ permission }: { permission: string }) {
  const t = useTranslations('settings.roles.enforcement');

  if (isEnforcedPermission(permission)) {
    return null;
  }

  return (
    <Badge
      variant="muted"
      className="text-[10px] font-normal"
      title={t('tooltip')}
      data-testid="permission-not-enforced-badge"
    >
      {t('badge')}
    </Badge>
  );
}
