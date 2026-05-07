/**
 * T-037 — Schema column wizard page
 * Server component. Reads deptId from URL searchParams and threads it to the
 * client wizard so handleSave has a valid dept context. If absent, renders a
 * placeholder pointing the user to /schema (department picker is a follow-up).
 */

import React, { Suspense } from 'react';
import SchemaColumnWizard from '../_components/SchemaColumnWizard';

type SearchParams = { deptId?: string | string[] };

export default async function SchemaWizardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = sp?.deptId;
  const deptId = Array.isArray(raw) ? raw[0] : raw;

  if (!deptId) {
    return (
      <main>
        <h1>Select a department</h1>
        <p>
          The schema column wizard requires a department. Add{' '}
          <code>?deptId=&lt;dept-uuid&gt;</code> to the URL or open the wizard from the
          department list at <a href="/schema">/schema</a>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <Suspense fallback={null}>
        <SchemaColumnWizard deptId={deptId} />
      </Suspense>
    </main>
  );
}
