import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { isPlatformAdmin } from "../../../lib/platform/platform-context";

type Locale = "en" | "pl" | "uk" | "ro";

type PlatformLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
};

/**
 * Platform route group — sits OUTSIDE the (app) org shell so it never inherits
 * the tenant sidebar/topbar. Access is gated server-side: only an un-revoked
 * app.platform_admins row (checked via isPlatformAdmin → assertPlatformAdmin on
 * the owner pool) may enter. Everyone else is redirected to the org dashboard.
 * RBAC is never client-trusted.
 */
export default async function PlatformRouteGroupLayout({ children, params }: PlatformLayoutProps) {
  const { locale } = await params;

  const allowed = await isPlatformAdmin();
  if (!allowed) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div data-testid="platform-shell" style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {children}
    </div>
  );
}
