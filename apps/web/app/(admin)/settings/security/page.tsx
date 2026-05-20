import React from 'react';
import SecurityPageClient, { type SecurityPageProps } from './client';

type SecurityRouteProps = Record<string, never>;
type SecurityPageInput = SecurityRouteProps & Partial<SecurityPageProps>;

function isControlledSecurityPage(props: SecurityPageInput): boolean {
  return (
    'policy' in props ||
    'sso' in props ||
    'ipAllowlist' in props ||
    'auditLogRows' in props ||
    'canManageSecurity' in props ||
    'state' in props ||
    'saveSecurity' in props
  );
}

const SecurityPageClientComponent = SecurityPageClient as React.ComponentType<Partial<SecurityPageProps>>;

async function SecurityPageServer() {
  const { loadSettingsSecurityPageProps } = await import('../../../../lib/settings/settings-page-loaders.js');
  const loaded = await loadSettingsSecurityPageProps();
  return React.createElement(SecurityPageClientComponent, loaded);
}

export default function SecurityPage(props: SecurityPageInput = {}) {
  if (isControlledSecurityPage(props)) {
    return React.createElement(SecurityPageClientComponent, props);
  }

  return React.createElement(SecurityPageServer);
}
