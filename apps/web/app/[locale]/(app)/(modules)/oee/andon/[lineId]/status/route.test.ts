import { beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({
  canView: true,
  contextThrows: false,
  lineStatus: { id: 'line-1', status: 'running' },
}));

vi.mock('../../andon-permissions', () => ({
  canViewAndonKiosk: vi.fn(async () => {
    if (gate.contextThrows) {
      throw new Error('withOrgContext: Supabase JWT verification failed');
    }
    return gate.canView;
  }),
}));

vi.mock('../../andon-data', () => ({
  CURRENT_ORG_ID: '11111111-1111-4111-8111-111111111111',
  getLineLiveStatus: vi.fn(async () => gate.lineStatus),
}));

describe('GET /oee/andon/[lineId]/status', () => {
  beforeEach(() => {
    gate.canView = true;
    gate.contextThrows = false;
    vi.clearAllMocks();
  });

  it('returns 401 when withOrgContext throws for an unauthenticated caller', async () => {
    gate.contextThrows = true;
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/status'), {
      params: Promise.resolve({ lineId: 'line-1' }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('returns 403 when the caller lacks oee.tv.kiosk_view', async () => {
    gate.canView = false;
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/status'), {
      params: Promise.resolve({ lineId: 'line-1' }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('returns live status when oee.tv.kiosk_view is granted', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/status'), {
      params: Promise.resolve({ lineId: 'line-1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: gate.lineStatus });
  });
});
