export default function OnboardingInProgressPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Onboarding</p>
      <h1 className="text-3xl font-semibold text-slate-950">Onboarding in progress</h1>
      <p className="text-base text-slate-600">
        Your organization setup is still being completed. An administrator must finish onboarding before
        this workspace is available.
      </p>
    </main>
  );
}
