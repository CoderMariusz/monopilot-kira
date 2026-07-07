import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_OWNER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

type QueryCall = { sql: string; params: unknown[] };

type OwnerGuardState = {
  activeOwnerIds: Set<string>;
  mutex: Promise<void>;
  txnHeld: boolean;
};

async function acquireTxn(state: OwnerGuardState): Promise<void> {
  const previous = state.mutex;
  let release!: () => void;
  state.mutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  state.txnHeld = true;
  state.releaseTxn = release;
}

type OwnerGuardStateWithRelease = OwnerGuardState & { releaseTxn?: () => void };

function releaseTxn(state: OwnerGuardStateWithRelease): void {
  if (!state.txnHeld) return;
  state.txnHeld = false;
  state.releaseTxn?.();
  state.releaseTxn = undefined;
}

type FakeClient = {
  calls: QueryCall[];
  grantedDeactivate: boolean;
  ownerGuard: OwnerGuardState;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function evaluateLastOwnerViolation(state: OwnerGuardState, targetUserId: string): boolean {
  const targetIsActiveOwner = state.activeOwnerIds.has(targetUserId);
  const otherActiveOwners = [...state.activeOwnerIds].filter((id) => id !== targetUserId);
  return targetIsActiveOwner && otherActiveOwners.length === 0;
}


function makeClient(ownerGuard: OwnerGuardStateWithRelease): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    grantedDeactivate: true,
    ownerGuard,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('from public.user_roles') && norm.includes('permission = any($3::text[])')) {
        return client.grantedDeactivate ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (norm.startsWith('with locked_active_owners')) {
        await acquireTxn(client.ownerGuard);
        const targetUserId = String(params[0]);
        return {
          rows: [{ last_owner_violation: evaluateLastOwnerViolation(client.ownerGuard, targetUserId) }],
          rowCount: 1,
        };
      }

      if (norm.startsWith('update public.users') && norm.includes('is_active = false')) {
        const targetUserId = String(params[0]);
        if (evaluateLastOwnerViolation(client.ownerGuard, targetUserId)) {
          releaseTxn(client.ownerGuard);
          return { rows: [], rowCount: 0 };
        }
        client.ownerGuard.activeOwnerIds.delete(targetUserId);
        return { rows: [{ id: targetUserId }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        releaseTxn(client.ownerGuard);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function makeOwnerGuard(activeOwnerIds: string[]): OwnerGuardStateWithRelease {
  return {
    activeOwnerIds: new Set(activeOwnerIds),
    mutex: Promise.resolve(),
    txnHeld: false,
  };
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient(makeOwnerGuard([TARGET_USER_ID, OTHER_OWNER_ID]));
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, client: currentClient }),
  );
});

async function loadDeactivateUser() {
  return import('./deactivate.ts');
}

describe('deactivateUser behavior', () => {
  it('uses canonical hasAnyPermission for settings.users.deactivate', async () => {
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, deactivated: true } });
    const permissionCall = currentClient.calls.find((call) => call.sql.includes('permission = any($3::text[])'));
    expect(permissionCall?.params[2]).toEqual(['org.access.admin', 'settings.users.deactivate']);
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(false);
  });

  it('blocks deactivating the sole active owner', async () => {
    currentClient.ownerGuard.activeOwnerIds = new Set([TARGET_USER_ID]);
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(true);
  });

  it('blocks deactivating the sole active owner even when an inactive owner retains the role', async () => {
    currentClient.ownerGuard.activeOwnerIds = new Set([TARGET_USER_ID]);
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(true);

    const guardCall = currentClient.calls.find((call) => call.sql.toLowerCase().includes('locked_active_owners'));
    expect(guardCall?.sql).toContain('u.is_active = true');
    expect(guardCall?.sql).toContain('for update of u');
    expect(guardCall?.sql).toContain('where user_id <> $1::uuid');
  });

  it('serializes concurrent deactivations so only one active owner can be removed', async () => {
    currentClient.ownerGuard.activeOwnerIds = new Set([TARGET_USER_ID, OTHER_OWNER_ID]);
    const { deactivateUser } = await loadDeactivateUser();

    const [firstResult, secondResult] = await Promise.all([
      deactivateUser({ targetUserId: TARGET_USER_ID }),
      deactivateUser({ targetUserId: OTHER_OWNER_ID }),
    ]);

    const successes = [firstResult, secondResult].filter((result) => result.ok);
    const failures = [firstResult, secondResult].filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.ownerGuard.activeOwnerIds.size).toBe(1);
  });

  it('returns forbidden without deactivate permission', async () => {
    currentClient.grantedDeactivate = false;
    const { deactivateUser } = await loadDeactivateUser();

    const result = await deactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.ownerGuard.activeOwnerIds.has(TARGET_USER_ID)).toBe(true);
  });
});
