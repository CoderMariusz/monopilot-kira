/**
 * T-037 — Schema column wizard page
 * Server component that renders the SchemaColumnWizard client component.
 */

import React, { Suspense } from 'react';
import SchemaColumnWizard from '../_components/SchemaColumnWizard';

export default function SchemaWizardPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <SchemaColumnWizard />
      </Suspense>
    </main>
  );
}
