import { getTranslations } from 'next-intl/server';

import {
  WIP_LABEL_KEY_MAP,
  WIP_LIBRARY_DEFAULT_LABELS,
  type WipLibraryLabels,
} from '../_components/wip-labels';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

export async function buildWipLibraryLabels(): Promise<WipLibraryLabels> {
  const t = await getTranslations('technical.wip');
  const keys = Object.keys(WIP_LIBRARY_DEFAULT_LABELS) as Array<keyof WipLibraryLabels>;
  return keys.reduce((acc, key) => {
    const messageKey = WIP_LABEL_KEY_MAP[key];
    try {
      const value = t(messageKey);
      acc[key] = !value || value.endsWith(messageKey) ? WIP_LIBRARY_DEFAULT_LABELS[key] : value;
    } catch {
      acc[key] = WIP_LIBRARY_DEFAULT_LABELS[key];
    }
    return acc;
  }, {} as WipLibraryLabels);
}
