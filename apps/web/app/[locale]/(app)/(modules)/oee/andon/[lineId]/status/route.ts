import { CURRENT_ORG_ID, getLineLiveStatus } from '../../andon-data';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ lineId: string }> },
): Promise<Response> {
  const { lineId } = await ctx.params;

  try {
    const data = await getLineLiveStatus(lineId, CURRENT_ORG_ID);
    return json({ data }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === 'andon_line_not_found') {
      return json({ error: 'not_found' }, 404);
    }
    console.error('[oee/andon] live status refresh failed', {
      lineId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: 'persistence_failed' }, 500);
  }
}
