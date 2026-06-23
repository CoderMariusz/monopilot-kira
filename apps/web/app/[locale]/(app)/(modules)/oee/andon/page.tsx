/**
 * 15-OEE — Andon board (graceful stub).
 *
 * The full Andon kiosk (real-time line status + downtime calls on the shop
 * floor) is a later OEE wave. This page reserves the `/oee/andon` route so it
 * is no longer a hard 404, using the shared ModuleStubNotice "coming soon"
 * marker (same pattern as /scheduler and /multi-site).
 */
import { getTranslations } from 'next-intl/server';

import { ModuleStubNotice } from '../../_components/module-stub-notice';

export default async function OeeAndonRoutePage() {
  const t = await getTranslations('oee.andon');

  return (
    <section
      data-testid="module-landing-oee-andon"
      className="p-8"
      aria-labelledby="module-landing-oee-andon-title"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1
          id="module-landing-oee-andon-title"
          className="text-3xl font-semibold tracking-tight text-slate-950"
        >
          {t('title')}
        </h1>
        <ModuleStubNotice badge={t('stubBadge')} notice={t('stubNotice')} />
      </div>
    </section>
  );
}
