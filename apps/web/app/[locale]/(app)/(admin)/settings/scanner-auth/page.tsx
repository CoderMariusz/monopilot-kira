import { getTranslations } from 'next-intl/server';

import { getScannerAuthPolicy, setScannerReverseAuthPolicy } from './_actions/scanner-auth-actions';
import ScannerAuthPoliciesScreen, {
  type ScannerAuthLabels,
} from './_components/scanner-auth-policies.client';

export const dynamic = 'force-dynamic';

type PageProps = { params?: Promise<{ locale: string }> };

const FALLBACK: ScannerAuthLabels = {
  title: 'Sign-off & PINs',
  description: 'PIN and sign-off requirements for scanner operations.',
  reverseTitle: 'Scanner reverse-consume',
  reverseDescription:
    'Control whether reversing a material consumption on the scanner needs a supervisor sign-off on top of the operator PIN.',
  toggleLabel: 'Require supervisor PIN for scanner reverse',
  toggleHelpOn:
    'A supervisor must enter their email and PIN (and hold consumption override-approve rights) for every scanner reversal, in addition to the operator PIN.',
  toggleHelpOff:
    'Operators can reverse a consumption with only their own PIN — no supervisor sign-off is required.',
  operatorNote:
    'The operator always needs their own PIN and the production.consumption.correct permission, regardless of this setting.',
  save: 'Save',
  saved: 'Scanner sign-off policy saved.',
  readOnly: 'You need admin rights to change scanner sign-off policies.',
  errorGeneric: 'Could not save. Try again.',
};

async function buildLabels(locale: string): Promise<ScannerAuthLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.scannerAuth' });
    const pick = (key: keyof ScannerAuthLabels): string => {
      try {
        const value = t(key as string);
        return value && value.length > 0 ? value : FALLBACK[key];
      } catch {
        return FALLBACK[key];
      }
    };
    return {
      title: pick('title'),
      description: pick('description'),
      reverseTitle: pick('reverseTitle'),
      reverseDescription: pick('reverseDescription'),
      toggleLabel: pick('toggleLabel'),
      toggleHelpOn: pick('toggleHelpOn'),
      toggleHelpOff: pick('toggleHelpOff'),
      operatorNote: pick('operatorNote'),
      save: pick('save'),
      saved: pick('saved'),
      readOnly: pick('readOnly'),
      errorGeneric: pick('errorGeneric'),
    };
  } catch {
    return { ...FALLBACK };
  }
}

export default async function SettingsScannerAuthPage({ params }: PageProps = {}) {
  const { locale } = params ? await params : { locale: 'en' };
  const [labels, loaded] = await Promise.all([buildLabels(locale), getScannerAuthPolicy()]);

  if (loaded.state === 'forbidden') {
    return (
      <main data-testid="settings-scanner-auth-page" data-screen="settings-scanner-auth" className="space-y-3 p-6">
        <header data-region="page-head">
          <h1 className="page-title">{labels.title}</h1>
        </header>
        <section
          data-testid="settings-scanner-auth-permission-denied-state"
          className="alert alert-amber"
          role="alert"
        >
          {labels.readOnly}
        </section>
      </main>
    );
  }

  if (loaded.state === 'error') {
    return (
      <main data-testid="settings-scanner-auth-page" data-screen="settings-scanner-auth" className="space-y-3 p-6">
        <header data-region="page-head">
          <h1 className="page-title">{labels.title}</h1>
        </header>
        <section className="alert alert-red" role="alert">
          Unable to load scanner sign-off settings.
        </section>
      </main>
    );
  }

  return (
    <main data-testid="settings-scanner-auth-page" data-screen="settings-scanner-auth" className="space-y-4 p-6">
      <header data-region="page-head" className="space-y-1">
        <h1 className="page-title">{labels.title}</h1>
        <p className="muted text-[13px]">{labels.description}</p>
      </header>
      <ScannerAuthPoliciesScreen
        policy={loaded.policy}
        canEdit={loaded.canEdit}
        labels={labels}
        setScannerReverseAuthPolicy={setScannerReverseAuthPolicy}
      />
    </main>
  );
}
