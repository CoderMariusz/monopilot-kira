import React from 'react';
import UsersPageClient, { type UsersPageProps } from './client';

type RouteSearchParams = UsersPageProps['searchParams'] | Promise<UsersPageProps['searchParams']>;

type UsersRouteProps = {
  searchParams?: RouteSearchParams;
};

type UsersPageInput = UsersRouteProps & Partial<UsersPageProps>;

function isControlledUsersPage(props: UsersPageInput): boolean {
  return (
    'users' in props ||
    'roles' in props ||
    'modules' in props ||
    'permissions' in props ||
    'kpis' in props ||
    'canManageUsers' in props ||
    'state' in props ||
    'inviteUser' in props ||
    'exportUsers' in props
  );
}

async function resolveSearchParams(searchParams: RouteSearchParams | undefined): Promise<UsersPageProps['searchParams']> {
  return searchParams ? await searchParams : undefined;
}

const UsersPageClientComponent = UsersPageClient as React.ComponentType<Partial<UsersPageProps>>;

async function UsersPageServer({ searchParams }: UsersRouteProps) {
  const { loadSettingsUsersPageProps } = await import('../../../../lib/settings/settings-page-loaders.js');
  const loaded = await loadSettingsUsersPageProps({ searchParams: await resolveSearchParams(searchParams) });
  return React.createElement(UsersPageClientComponent, loaded);
}

export default function UsersPage(props: UsersPageInput = {}) {
  if (isControlledUsersPage(props)) {
    const controlledSearchParams = props.searchParams && typeof (props.searchParams as Promise<unknown>).then === 'function'
      ? undefined
      : (props.searchParams as UsersPageProps['searchParams']);
    return React.createElement(UsersPageClientComponent, { ...props, searchParams: controlledSearchParams });
  }

  return React.createElement(UsersPageServer, { searchParams: props.searchParams });
}
