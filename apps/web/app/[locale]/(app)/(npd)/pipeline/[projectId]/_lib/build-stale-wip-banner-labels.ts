import { getTranslations } from 'next-intl/server';

import type { StaleWipDefinitionBannerLabels } from '../_components/stale-wip-definition-banner';

const DEFAULT_LABELS: StaleWipDefinitionBannerLabels = {
  updatedMessage: "WIP definition '{name}' was updated to v{version}",
  acceptButton: 'Update & accept',
  accepting: 'Accepting…',
  acceptSuccess: 'WIP definition update accepted.',
  acceptSuccessBomsRegenerated: 'WIP definition accepted and production BOMs were regenerated.',
  acceptError: 'Could not accept the WIP definition update. Try again.',
  acceptForbidden: 'You do not have permission to accept WIP definition updates.',
};

export async function buildStaleWipBannerLabels(locale: string): Promise<StaleWipDefinitionBannerLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.staleWipBanner' });
    const pick = (key: keyof StaleWipDefinitionBannerLabels, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    return {
      updatedMessage: pick('updatedMessage', DEFAULT_LABELS.updatedMessage),
      acceptButton: pick('acceptButton', DEFAULT_LABELS.acceptButton),
      accepting: pick('accepting', DEFAULT_LABELS.accepting),
      acceptSuccess: pick('acceptSuccess', DEFAULT_LABELS.acceptSuccess),
      acceptSuccessBomsRegenerated: pick(
        'acceptSuccessBomsRegenerated',
        DEFAULT_LABELS.acceptSuccessBomsRegenerated,
      ),
      acceptError: pick('acceptError', DEFAULT_LABELS.acceptError),
      acceptForbidden: pick('acceptForbidden', DEFAULT_LABELS.acceptForbidden),
    };
  } catch {
    return { ...DEFAULT_LABELS };
  }
}
