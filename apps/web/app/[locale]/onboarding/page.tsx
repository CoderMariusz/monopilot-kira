import { redirect } from 'next/navigation';

type OnboardingIndexProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalizedOnboardingIndex({ params }: OnboardingIndexProps) {
  const { locale } = await params;
  redirect(`/${locale}/onboarding/profile`);
}
