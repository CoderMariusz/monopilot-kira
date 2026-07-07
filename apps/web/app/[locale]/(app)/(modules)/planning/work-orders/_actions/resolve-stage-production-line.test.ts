import { describe, expect, it, vi } from 'vitest';

import { loadStageProductionLineIds } from './resolve-stage-production-line';
import type { OrgActionContext } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '44444444-4444-4444-8444-444444444444';
const WIP_ITEM_ID = '55555555-5555-4555-8555-555555555555';
const WIP_LINE_ID = '66666666-6666-4666-8666-666666666666';
const FG_LINE_ID = '77777777-7777-4777-8777-777777777777';

describe('loadStageProductionLineIds', () => {
  it('resolves distinct routing/process lines for WIP stages vs the FG root', async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain('routing_line.line_id');
      expect(sql).toContain('process_line.line_id');
      expect(sql).toContain('project_line.production_line_id');
      return {
        rows: [
          { item_id: WIP_ITEM_ID, production_line_id: WIP_LINE_ID },
          { item_id: FG_ITEM_ID, production_line_id: FG_LINE_ID },
        ],
      };
    });
    const ctx: OrgActionContext = { userId: USER_ID, orgId: ORG_ID, client: { query } };

    const lines = await loadStageProductionLineIds(ctx, FG_ITEM_ID, [
      { itemId: WIP_ITEM_ID, isFg: false },
      { itemId: FG_ITEM_ID, isFg: true },
    ]);

    expect(lines.get(WIP_ITEM_ID)).toBe(WIP_LINE_ID);
    expect(lines.get(FG_ITEM_ID)).toBe(FG_LINE_ID);
    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      [[WIP_ITEM_ID, FG_ITEM_ID], [false, true], FG_ITEM_ID],
    );
  });
});
