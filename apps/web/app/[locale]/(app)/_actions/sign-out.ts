"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "../../../../lib/auth/supabase-server";

const SUPPORTED_LOCALES = new Set(["en", "pl", "uk", "ro"]);

function localeFrom(formData: FormData) {
  const rawLocale = formData.get("locale");
  return typeof rawLocale === "string" && SUPPORTED_LOCALES.has(rawLocale) ? rawLocale : "en";
}

export async function signOut(formData: FormData): Promise<never> {
  const locale = localeFrom(formData);
  const supabase = await createServerSupabaseClient();

  await supabase.auth.signOut();

  return redirect(`/${locale}/login`);
}
