/**
 * P2-PLANNING — /planning/work-orders/new redirect.
 *
 * Onboarding links to /planning/work-orders/new (a live 404 today). A static
 * `new/` segment takes precedence over the sibling `[id]/` dynamic segment, so
 * this route never resolves to the WO-detail page. It simply redirects to the
 * list route with ?new=1, which auto-opens the Create WO modal (page.tsx +
 * wo-list-view.tsx). Keeps the create entry point honest from every link.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewWorkOrderRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/planning/work-orders?new=1`);
}
