import { getTranslations } from 'next-intl/server';

import ModalGalleryClient, { type ModalGalleryLabels } from './modal-gallery.client';

type GalleryPageProps = {
  params?: Promise<{ locale: string }>;
};

const LABEL_KEYS: Array<keyof ModalGalleryLabels> = [
  'title',
  'subtitle',
  'note',
  'openTrigger',
  'cancel',
  'close',
];

/**
 * Settings → Modal gallery.
 *
 * Developer / design-system reference surface — no Supabase data. Renders the
 * client gallery (one Section per modal variant, each with a trigger that opens
 * the REAL shared `@monopilot/ui/Modal`). Mirrors the prototype catalogue in
 * `prototypes/design/Monopilot Design System/settings/modals.jsx`.
 */
export default async function GallerySettingsPage(props: GalleryPageProps = {}) {
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const t = await getTranslations({ locale, namespace: 'settings.gallery' });

  const labels = LABEL_KEYS.reduce((acc, key) => {
    acc[key] = t(key);
    return acc;
  }, {} as ModalGalleryLabels);

  return <ModalGalleryClient labels={labels} />;
}
