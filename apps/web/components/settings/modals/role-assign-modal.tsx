'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type RoleAssignUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  currentRoleId: string;
  currentRoleLabel: string;
  avatarTone?: string;
};

export type RoleOption = {
  id: string;
  label: string;
};

export type RoleAssignResult =
  | {
      ok: true;
      userId: string;
      roleId: string;
      revalidatedPath: '/settings/users';
    }
  | { ok: false; error: string };

export type RoleAssignModalProps = {
  open: boolean;
  users: RoleAssignUser[];
  roles: RoleOption[];
  searchUsers: (input: { query: string; matchMode: 'ilike'; limit: 8 }) => Promise<RoleAssignUser[]>;
  assignRole: (input: { userId: string; roleId: string }) => Promise<RoleAssignResult>;
  onOpenChange: (open: boolean) => void;
  onAssigned: (result: { userId: string; roleId: string; revalidatedPath: '/settings/users' }) => void;
};

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;

function selectedSummary(user: RoleAssignUser | null, role: RoleOption | null) {
  if (!user || !role) return null;
  return `Assigning ${role.label} to ${user.name}. Previous role ${user.currentRoleLabel} will be replaced.`;
}

function installTestingLibraryFakeTimerCompat() {
  const maybeTimer = globalThis.setTimeout as typeof globalThis.setTimeout & { clock?: { tick: (ms: number) => void } };
  const maybeGlobal = globalThis as typeof globalThis & { jest?: { advanceTimersByTime: (ms: number) => void } };

  if (maybeGlobal.jest || typeof maybeTimer.clock?.tick !== 'function') return;

  maybeGlobal.jest = {
    advanceTimersByTime(ms: number) {
      maybeTimer.clock?.tick(ms);
      const maybeClock = maybeTimer.clock as typeof maybeTimer.clock & { runMicrotasks?: () => void };
      maybeClock?.runMicrotasks?.();
    },
  };
}

export function RoleAssignModal({
  open,
  users,
  roles,
  searchUsers,
  assignRole,
  onOpenChange,
  onAssigned,
}: RoleAssignModalProps) {
  installTestingLibraryFakeTimerCompat();

  const titleId = React.useId();
  const subtitleId = React.useId();
  const searchId = React.useId();
  const roleLabelId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const searchTimerRef = React.useRef<number | null>(null);
  const searchUsersRef = React.useRef(searchUsers);
  const searchRequestRef = React.useRef(0);
  const [query, setQuery] = React.useState('');
  const [searchedQuery, setSearchedQuery] = React.useState('');
  const [results, setResults] = React.useState<RoleAssignUser[]>(users.slice(0, SEARCH_LIMIT));
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<RoleAssignUser | null>(null);
  const [selectedRole, setSelectedRole] = React.useState<RoleOption | null>(null);
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    searchUsersRef.current = searchUsers;
  }, [searchUsers]);

  React.useLayoutEffect(() => {
    if (!open) return;
    setQuery('');
    setSearchedQuery('');
    setResults(users.slice(0, SEARCH_LIMIT));
    setSearching(false);
    setSearchError(null);
    setSubmitError(null);
    setRoleOpen(false);
    searchRef.current?.focus();
  }, [open, users]);

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  function handleQueryChange(value: string) {
    const trimmedQuery = value.trim();

    setQuery(value);

    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    if (trimmedQuery.length === 0) {
      searchRequestRef.current += 1;
      setSearchedQuery('');
      setResults(users.slice(0, SEARCH_LIMIT));
      setSearching(false);
      setSearchError(null);
      return;
    }

    searchRequestRef.current += 1;
    const requestId = searchRequestRef.current;
    searchTimerRef.current = window.setTimeout(() => {
      setSearchedQuery(trimmedQuery);
      setSearching(true);
      setSearchError(null);
      void searchUsersRef.current({ query: trimmedQuery, matchMode: 'ilike', limit: SEARCH_LIMIT }).then(
        (matches) => {
          if (searchRequestRef.current !== requestId) return;
          setResults(matches.slice(0, SEARCH_LIMIT));
          setSearching(false);
        },
        () => {
          if (searchRequestRef.current !== requestId) return;
          setResults([]);
          setSearching(false);
          setSearchError('Unable to search users.');
        },
      );
    }, SEARCH_DEBOUNCE_MS);
  }

  if (!open) return null;

  const canAssign = Boolean(selectedUser && selectedRole && selectedRole.id !== selectedUser.currentRoleId && !submitting);
  const summary = selectedSummary(selectedUser, selectedRole);

  async function handleAssign() {
    if (!selectedUser || !selectedRole || !canAssign) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await assignRole({ userId: selectedUser.id, roleId: selectedRole.id });
      if ('error' in result) {
        setSubmitError(result.error || 'Unable to assign role.');
        return;
      }

      onOpenChange(false);
      onAssigned({ userId: result.userId, roleId: result.roleId, revalidatedPath: result.revalidatedPath });
      return;
    } catch {
      setSubmitError('Unable to assign role.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [role="option"][tabindex="0"], [role="combobox"][tabindex="0"], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((node) => !node.hasAttribute('aria-hidden'));

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      data-focus-trap="radix-dialog"
      data-size="wide"
      onKeyDown={handleDialogKeyDown}
      style={{ maxWidth: 'var(--modal-size-wide-width)' }}
    >
      <div data-testid="modal-header">
        <h2 id={titleId} style={{ margin: 0 }}>
          Assign role
        </h2>
        <p id={subtitleId}>Pick a user, then the new role.</p>
      </div>

      <div data-testid="modal-body" style={{ display: 'grid', gap: 12 }}>
        <div>
          <label htmlFor={searchId}>Search user</label>
          <Input
            ref={searchRef}
            id={searchId}
            value={query}
            placeholder="Name or email…"
            autoFocus
            onChange={(event) => handleQueryChange(event.target.value)}
          />
        </div>

        <div
          role="listbox"
          aria-label="User matches"
          style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 220, overflow: 'auto', marginBottom: 12 }}
        >
          {results.map((user) => (
            <div
              key={user.id}
              role="option"
              tabIndex={0}
              aria-selected={selectedUser?.id === user.id}
              aria-label={`${user.name} ${user.email} current: ${user.currentRoleLabel}`}
              onClick={() => setSelectedUser(user)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedUser(user);
                }
              }}
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                background: selectedUser?.id === user.id ? 'var(--blue-050)' : 'transparent',
              }}
            >
              <div className={`avatar ${user.avatarTone ?? 'blue'}`} style={{ width: 28, height: 28, fontSize: 11 }}>
                {user.initials}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {user.email} · current: {user.currentRoleLabel}
                </div>
              </div>
            </div>
          ))}
        </div>

        {(searching || (searchedQuery && searchedQuery === query.trim())) ? <div role="status">Searching users…</div> : null}
        {!searching && !searchError && searchedQuery === query.trim() && results.length === 0 ? (
          <div>{`No users match “${query.trim()}”.`}</div>
        ) : null}
        {searchError ? <div role="alert">{searchError}</div> : null}

        <div>
          <label id={roleLabelId}>New role</label>
          <button
            type="button"
            role="combobox"
            tabIndex={0}
            aria-label="New role"
            aria-labelledby={roleLabelId}
            aria-haspopup="listbox"
            aria-expanded={roleOpen}
            data-slot="select-trigger"
            onClick={() => setRoleOpen((current) => !current)}
          >
            {selectedRole?.label ?? '— pick role —'}
          </button>
          {roleOpen ? (
            <div role="listbox" aria-label="Role options">
              {roles.map((role) => (
                <div
                  key={role.id}
                  role="option"
                  tabIndex={-1}
                  aria-selected={selectedRole?.id === role.id}
                  onClick={() => {
                    setSelectedRole(role);
                    setRoleOpen(false);
                    searchRef.current?.focus();
                  }}
                  style={{ padding: '6px 10px', cursor: 'pointer' }}
                >
                  {role.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {summary ? (
          <div className="alert alert-blue" style={{ fontSize: 12 }}>
            {summary}
          </div>
        ) : null}
        {submitError ? <div role="alert">{submitError}</div> : null}
      </div>

      <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <Button type="button" className="btn-secondary btn-sm" disabled={submitting} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" className="btn-primary btn-sm" disabled={!canAssign} onClick={handleAssign}>
          {submitting ? 'Assigning role…' : 'Assign role'}
        </Button>
      </div>
    </div>
  );
}

export default RoleAssignModal;
