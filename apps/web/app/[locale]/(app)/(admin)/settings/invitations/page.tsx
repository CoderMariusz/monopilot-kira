/**
 * T-119 / SET-010 — Localized Pending Invitations route (Server Component).
 *
 * SSR wrapper that prefetches real invitation data via the T-124 lifecycle
 * Server Action (`listInvitations`, wrapped in withOrgContext) so the first
 * paint renders the real org-scoped table instead of a loading-only skeleton.
 *
 * Parity source: prototypes/design/Monopilot Design System/settings/access-screens.jsx:232-243
 * (Security "Audit log" table pattern) + 02-SETTINGS-UX.md:404-417 invitations table.
 *
 * Dual mode: when controlled props (invitations/permissions/state) are passed —
 * the RTL test path — the client component is rendered directly with those props.
 * Otherwise the route prefetches real data and hands it to the client as a
 * controlled component (no client-side fetch round-trip, no skeleton-first flash).
 *
 * Structural consolidation (F4): the canonical client island now lives at
 * ./invitations-screen.client.tsx (co-located in the localized tree). The legacy
 * non-localized (admin)/settings/invitations/page.tsx is a redirect shim that
 * points here.
 */
import {
  listInvitations,
  type ListInvitationsResult,
} from '../../../../../../actions/users/invitations-lifecycle';
import InvitationsClient, { type InvitationsScreenProps } from './invitations-screen.client';

const VIEW_PERMISSION = 'settings.users.view';
const INVITE_PERMISSION = 'settings.users.invite';
const ROLE_ASSIGN_PERMISSION = 'settings.roles.assign';

type InvitationStatus = 'pending' | 'expired' | 'accepted';

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: InvitationStatus;
  inviteToken?: string;
};

type RouteProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PageInput = Partial<InvitationsScreenProps> & RouteProps;

export const dynamic = 'force-dynamic';

type ListedInvitation = {
  id: string;
  email: string;
  role: string | null;
  invitedBy: string | null;
  invitedAt: string | null;
  expiresAt: string | null;
  status: string;
};

function normalizeStatus(status: string): InvitationStatus | null {
  if (status === 'pending' || status === 'expired' || status === 'accepted') return status;
  return null;
}

function toPendingInvitation(item: ListedInvitation): PendingInvitation | null {
  const status = normalizeStatus(String(item.status));
  if (!status) return null;
  return {
    id: item.id,
    email: item.email,
    role: item.role ?? 'Unassigned',
    invitedBy: item.invitedBy ?? 'System',
    invitedAt: item.invitedAt ?? '—',
    expiresAt: item.expiresAt ?? '—',
    status,
    // listInvitations deliberately does NOT surface the raw invite_token
    // (security: tokens are write-path only). Lifecycle write controls render
    // "Lifecycle action unavailable" until the token is fetched on demand.
    inviteToken: undefined,
  };
}

async function prefetchInvitations(): Promise<{
  invitations: PendingInvitation[];
  permissions: string[];
  state: 'ready' | 'empty' | 'error';
  errorMessage?: string;
}> {
  let result: ListInvitationsResult;
  try {
    result = await listInvitations();
  } catch {
    return { invitations: [], permissions: [], state: 'error', errorMessage: 'Invitations could not be loaded.' };
  }

  if (!result.ok) {
    if (result.error === 'forbidden') {
      return {
        invitations: [],
        permissions: [],
        state: 'error',
        errorMessage: `Permission denied: ${VIEW_PERMISSION} or ${INVITE_PERMISSION} is required to view pending invitations.`,
      };
    }
    return { invitations: [], permissions: [], state: 'error', errorMessage: 'Invitations could not be loaded.' };
  }

  const invitations = result.data.invitations
    .map((item) => toPendingInvitation(item))
    .filter((item): item is PendingInvitation => item !== null);

  return {
    invitations,
    permissions: [VIEW_PERMISSION, INVITE_PERMISSION, ROLE_ASSIGN_PERMISSION],
    state: invitations.length > 0 ? 'ready' : 'empty',
  };
}

export default async function LocalizedInvitationsPage(props: PageInput = {}) {
  const isControlled = 'invitations' in props || 'permissions' in props || 'state' in props;

  // Controlled mode (RTL test harness passes data props directly): render the
  // client as-is so behaviour assertions exercise the production component.
  if (isControlled) {
    return <InvitationsClient {...(props as InvitationsScreenProps)} />;
  }

  // SSR mode: prefetch real org-scoped invitations and render the client as a
  // controlled component so the first paint shows real data, not a skeleton.
  const { invitations, permissions, state, errorMessage } = await prefetchInvitations();

  // Note: lifecycle write actions (resend/revoke) are intentionally NOT wired
  // here — listInvitations does not surface the raw invite_token, so the client
  // renders write controls as unavailable until a token is fetched on demand.
  // Wiring them with the SSR list (token-less) would produce stale_token errors.
  return (
    <InvitationsClient
      invitations={invitations}
      permissions={permissions}
      state={state}
      errorMessage={errorMessage}
    />
  );
}
