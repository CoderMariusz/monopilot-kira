import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';

describe('SCIM v2 Groups route auth', () => {
  it('returns 401 when the bearer header is missing', async () => {
    const response = await GET(new Request('https://web.test/scim/v2/Groups'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
    });
  });

  it('returns 401 when the bearer header is malformed', async () => {
    const response = await POST(
      new Request('https://web.test/scim/v2/Groups', {
        method: 'POST',
        headers: {
          authorization: 'Bearer bad',
          'content-type': 'application/scim+json',
        },
        body: JSON.stringify({ displayName: 'Line Leads' }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
